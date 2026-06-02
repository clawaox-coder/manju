"""图像生成服务(canvas-image-generation):OpenAI gpt-image-1 + asset-service 上传。

约定:
  - 用 httpx 直接调 OpenAI REST(与 tts_generate 同模式,不引入 openai SDK 依赖)
  - 无 OPENAI_API_KEY → 503 IMAGE_PROVIDER_UNAVAILABLE
  - 上游错 → 502 OPENAI_IMAGE_ERROR(失败不消耗配额,由 services/ai.py 控制)
  - 上传走 asset-service /v1/upload/sign + PUT(S2S token,与 _fetch_project_reference_images 同模式)
  - 上传失败 → 502 IMAGE_UPLOAD_ERROR(同样不消耗配额)
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
from fastapi import HTTPException

from ..config import get_settings
from .. import internal_token

logger = logging.getLogger("ai-gateway.image")

OPENAI_IMAGE_URL = "https://api.openai.com/v1/images"
IMAGE_TIMEOUT = 60.0   # 单张 gpt-image-1 5-15s,留余量
UPLOAD_TIMEOUT = 30.0


def _require_openai_key() -> str:
    s = get_settings()
    if not s.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "IMAGE_PROVIDER_UNAVAILABLE",
                "message": "图像服务未配置:请设置 OPENAI_API_KEY",
            },
        )
    return s.openai_api_key


async def generate_image(
    *,
    prompt: str,
    size: str,
    reference_images: list[dict] | None = None,
) -> bytes:
    """调 OpenAI gpt-image-1 生图,返 PNG bytes。

    reference_images: [{"data": <base64 str>, "media_type": "image/png"}] —— 复用
    既有 _fetch_project_reference_images 的格式。有则走 images.edit(多模态),否则 images.generate。
    """
    api_key = _require_openai_key()
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=IMAGE_TIMEOUT) as client:
        try:
            if reference_images:
                # images.edit:multipart/form-data,每张参考图作为一个 image[] file
                files: list[tuple[str, tuple[str, bytes, str]]] = []
                for i, img in enumerate(reference_images):
                    img_bytes = base64.b64decode(img["data"])
                    media = img.get("media_type", "image/png")
                    ext = "png" if media.endswith("png") else "jpg"
                    files.append(("image[]", (f"ref_{i}.{ext}", img_bytes, media)))
                form: dict[str, Any] = {
                    "model": "gpt-image-1",
                    "prompt": prompt,
                    "size": size,
                    "quality": "medium",
                    "n": "1",
                }
                resp = await client.post(
                    f"{OPENAI_IMAGE_URL}/edits", headers=headers, files=files, data=form,
                )
            else:
                resp = await client.post(
                    f"{OPENAI_IMAGE_URL}/generations",
                    headers=headers,
                    json={
                        "model": "gpt-image-1",
                        "prompt": prompt,
                        "size": size,
                        "quality": "medium",
                        "n": 1,
                    },
                )
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail={"code": "IMAGE_NETWORK_ERROR", "message": f"OpenAI 网络错误:{e}"},
            )

        if resp.status_code != 200:
            logger.error(f"OpenAI image error: {resp.status_code} {resp.text[:300]}")
            raise HTTPException(
                status_code=502,
                detail={"code": "OPENAI_IMAGE_ERROR", "message": f"OpenAI 图像生成失败:{resp.status_code}"},
            )
        body = resp.json()
        try:
            b64 = body["data"][0]["b64_json"]
        except (KeyError, IndexError) as e:
            raise HTTPException(
                status_code=502,
                detail={"code": "OPENAI_IMAGE_ERROR", "message": f"OpenAI 响应缺 b64_json:{e}"},
            )
        return base64.b64decode(b64)


async def upload_to_asset_service(
    *,
    team_id: str,
    content: bytes,
    content_type: str,
    purpose: str,
    filename: str | None = None,
) -> str:
    """把生成的图上传到 asset-service:sign_upload → PUT presigned URL → 返 file_url。

    用 S2S token(与 _fetch_project_reference_images 同模式)。
    asset-service `RequireWriteRole` 接 role='owner' 通过(S2S token 默认 owner)。
    """
    if not internal_token.has_s2s():
        raise HTTPException(
            status_code=503,
            detail={"code": "IMAGE_UPLOAD_UNAVAILABLE", "message": "S2S token 不可用,无法上传图像"},
        )
    s = get_settings()
    name = filename or f"generated.{('png' if content_type.endswith('png') else 'jpg')}"
    token = internal_token.mint_s2s_token(team_id)

    async with httpx.AsyncClient(timeout=UPLOAD_TIMEOUT) as client:
        try:
            sign_resp = await client.post(
                f"{s.asset_service_url}/v1/upload/sign",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "filename": name,
                    "content_type": content_type,
                    "size_bytes": len(content),
                    "purpose": purpose,
                },
            )
            if sign_resp.status_code != 200:
                logger.error(f"sign_upload failed: {sign_resp.status_code} {sign_resp.text[:300]}")
                raise HTTPException(
                    status_code=502,
                    detail={"code": "IMAGE_UPLOAD_ERROR", "message": "签发上传凭证失败"},
                )
            sign = sign_resp.json().get("data", {})
            upload_url = sign.get("upload_url")
            file_url = sign.get("file_url")
            upload_headers = sign.get("headers") or {}
            method = (sign.get("method") or "PUT").upper()
            if not upload_url or not file_url:
                raise HTTPException(
                    status_code=502,
                    detail={"code": "IMAGE_UPLOAD_ERROR", "message": "sign_upload 响应缺字段"},
                )

            put_resp = await client.request(
                method, upload_url, headers=upload_headers, content=content,
            )
            if put_resp.status_code not in (200, 201, 204):
                logger.error(f"upload PUT failed: {put_resp.status_code} {put_resp.text[:300]}")
                raise HTTPException(
                    status_code=502,
                    detail={"code": "IMAGE_UPLOAD_ERROR", "message": f"上传失败:{put_resp.status_code}"},
                )
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail={"code": "IMAGE_UPLOAD_ERROR", "message": f"上传网络错误:{e}"},
            )

    return file_url
