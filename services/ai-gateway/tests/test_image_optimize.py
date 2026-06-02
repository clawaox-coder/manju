"""P5.2:图像优化端点的 service 层单测(mock 掉 repo + image client + quota)。

不依赖 docker / DB / OpenAI,验证业务分支:
  - shot/optimize mode=image happy path:check_and_reserve → generate_image → upload → update_shot_image → consume,写回 image_url
  - shot/optimize mode=both:text 与 image 都跑,各自落地
  - character/optimize generate_avatar=true happy path:写回 file_url
  - 配额超限:check_and_reserve 抛 QuotaExceeded → 转 429,**generate_image 不被调,consume 不被调**
  - 上游 502:image.generate_image raise 502,**consume 不被调**(失败不计配额)
  - 上传 502:upload_to_asset_service raise 502,**consume 不被调**

真 SQL 行为(quota 表 FOR UPDATE / INSERT ON CONFLICT / 月份滚动)由 CI 上集成测试覆盖,
本环境无 docker 跑不了,见 VERIFICATION.md。
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.repo import assets as assets_repo
from app.repo import image_quota
from app.repo import shots as shots_repo
from app.services import ai as ai_svc
from app.services import image as image_svc

pytestmark = pytest.mark.asyncio(loop_scope="session")

TEAM = "00000000-0000-0000-0000-000000000001"
USER = "00000000-0000-0000-0000-000000000002"


# ---- 默认 mock:让通用路径 happy(每个测试按需覆盖单点) ----

def _install_image_happy_path(monkeypatch, **overrides):
    """安装一组默认 mock 让 image 流程 happy:quota OK / 生图返 bytes / 上传返 url / consume 记录。"""
    state = {"consume_called": False, "generate_called": False, "upload_called": False}

    async def fake_check_and_reserve(**kw):
        return (0, 50)

    async def fake_consume(**kw):
        state["consume_called"] = True
        return 1

    async def fake_fetch_refs(*args, **kw):
        return []

    async def fake_generate_image(**kw):
        state["generate_called"] = True
        return b"FAKE_PNG_BYTES"

    async def fake_upload(**kw):
        state["upload_called"] = True
        return "https://minio/test/abc.png"

    monkeypatch.setattr(image_quota, "check_and_reserve", overrides.get("check_and_reserve", fake_check_and_reserve))
    monkeypatch.setattr(image_quota, "consume", overrides.get("consume", fake_consume))
    monkeypatch.setattr(ai_svc, "_fetch_project_reference_images", overrides.get("fetch_refs", fake_fetch_refs))
    monkeypatch.setattr(image_svc, "generate_image", overrides.get("generate_image", fake_generate_image))
    monkeypatch.setattr(image_svc, "upload_to_asset_service", overrides.get("upload", fake_upload))
    return state


def _stub_llm(monkeypatch, text: str = "新内容"):
    async def fake(**kwargs):
        return {"text": text}, None
    monkeypatch.setattr(ai_svc, "_run_and_record", fake)


# ---- shot/optimize image mode ----

async def test_shot_image_happy_writes_image_url(monkeypatch):
    state = _install_image_happy_path(monkeypatch)

    async def fake_get_shot(**kw):
        return {"title": "镜1", "dialog": "旧对白", "image_url": "old.png"}

    captured = {}

    async def fake_update_image(*, team_id, user_id, shot_id, image_url):
        captured["image_url"] = image_url
        return image_url

    monkeypatch.setattr(shots_repo, "get_shot", fake_get_shot)
    monkeypatch.setattr(shots_repo, "update_shot_image", fake_update_image)

    out = await ai_svc.optimize_shot(
        team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
        instruction="夜晚雨景", ref_image_url=None, mode="image",
    )

    assert out["image_url"] == "https://minio/test/abc.png"
    assert captured["image_url"] == "https://minio/test/abc.png"
    assert state["generate_called"]
    assert state["upload_called"]
    assert state["consume_called"]


async def test_shot_both_runs_text_and_image(monkeypatch):
    state = _install_image_happy_path(monkeypatch)
    dialog_saved = {}

    async def fake_get_shot(**kw):
        return {"title": "镜1", "dialog": "旧", "image_url": None}

    async def fake_update_dialog(*, team_id, user_id, shot_id, dialog):
        dialog_saved["dialog"] = dialog
        return dialog

    async def fake_update_image(*, team_id, user_id, shot_id, image_url):
        return image_url

    monkeypatch.setattr(shots_repo, "get_shot", fake_get_shot)
    monkeypatch.setattr(shots_repo, "update_shot_dialog", fake_update_dialog)
    monkeypatch.setattr(shots_repo, "update_shot_image", fake_update_image)
    _stub_llm(monkeypatch, "新对白")

    out = await ai_svc.optimize_shot(
        team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
        instruction="改", ref_image_url=None, mode="both",
    )

    assert out["dialog"] == "新对白"
    assert dialog_saved["dialog"] == "新对白"
    assert out["image_url"] == "https://minio/test/abc.png"
    assert state["consume_called"]


# ---- 配额超限 ----

async def test_shot_image_quota_exceeded_429(monkeypatch):
    async def fake_get_shot(**kw):
        return {"title": "镜1", "dialog": "", "image_url": None}

    async def fake_check(**kw):
        raise image_quota.QuotaExceeded(used=50, limit=50)

    generate_called = {"v": False}
    consume_called = {"v": False}

    async def fake_generate(**kw):
        generate_called["v"] = True
        return b""

    async def fake_consume(**kw):
        consume_called["v"] = True
        return 0

    async def fake_fetch_refs(*args, **kw):
        return []

    monkeypatch.setattr(shots_repo, "get_shot", fake_get_shot)
    monkeypatch.setattr(image_quota, "check_and_reserve", fake_check)
    monkeypatch.setattr(image_quota, "consume", fake_consume)
    monkeypatch.setattr(image_svc, "generate_image", fake_generate)
    monkeypatch.setattr(ai_svc, "_fetch_project_reference_images", fake_fetch_refs)

    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_shot(
            team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
            instruction="x", ref_image_url=None, mode="image",
        )

    assert e.value.status_code == 429
    assert e.value.detail["code"] == "IMAGE_QUOTA_EXCEEDED"
    # 关键:超额时 generate_image 与 consume 都不被调用
    assert not generate_called["v"]
    assert not consume_called["v"]


# ---- 上游 / 上传失败不计配额 ----

async def test_shot_image_upstream_502_does_not_consume(monkeypatch):
    consume_called = {"v": False}

    async def fake_consume(**kw):
        consume_called["v"] = True
        return 0

    async def fake_generate(**kw):
        raise HTTPException(status_code=502, detail={"code": "OPENAI_IMAGE_ERROR", "message": "上游错"})

    _install_image_happy_path(
        monkeypatch,
        consume=fake_consume,
        generate_image=fake_generate,
    )

    async def fake_get_shot(**kw):
        return {"title": "镜1", "dialog": "", "image_url": None}

    monkeypatch.setattr(shots_repo, "get_shot", fake_get_shot)

    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_shot(
            team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
            instruction="x", ref_image_url=None, mode="image",
        )
    assert e.value.status_code == 502
    assert not consume_called["v"]


async def test_shot_image_upload_502_does_not_consume(monkeypatch):
    consume_called = {"v": False}

    async def fake_consume(**kw):
        consume_called["v"] = True
        return 0

    async def fake_upload(**kw):
        raise HTTPException(status_code=502, detail={"code": "IMAGE_UPLOAD_ERROR", "message": "上传失败"})

    _install_image_happy_path(
        monkeypatch,
        consume=fake_consume,
        upload=fake_upload,
    )

    async def fake_get_shot(**kw):
        return {"title": "镜1", "dialog": "", "image_url": None}

    monkeypatch.setattr(shots_repo, "get_shot", fake_get_shot)

    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_shot(
            team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
            instruction="x", ref_image_url=None, mode="image",
        )
    assert e.value.status_code == 502
    assert not consume_called["v"]


# ---- character generate_avatar ----

async def test_character_generate_avatar_writes_file_url(monkeypatch):
    state = _install_image_happy_path(monkeypatch)

    async def fake_get(**kw):
        return {"id": "a", "type": "character", "name": "小明", "description": "冷酷"}

    captured = {}

    async def fake_update_file_url(*, team_id, user_id, asset_id, file_url):
        captured["file_url"] = file_url
        return file_url

    monkeypatch.setattr(assets_repo, "get_character_asset", fake_get)
    monkeypatch.setattr(assets_repo, "update_asset_file_url", fake_update_file_url)

    out = await ai_svc.optimize_character(
        team_id=TEAM, user_id=USER, project_id="p", asset_id="a",
        instruction="加红斗篷", generate_avatar=True,
    )

    assert out["file_url"] == "https://minio/test/abc.png"
    assert captured["file_url"] == "https://minio/test/abc.png"
    assert state["consume_called"]
    # description 字段保留旧值(不被 avatar 路径修改)
    assert out["description"] == "冷酷"


async def test_character_default_path_still_works(monkeypatch):
    """generate_avatar=False 时仍走改 description 路径(不触发 image / quota)。"""
    image_touched = {"v": False}

    async def fake_generate(**kw):
        image_touched["v"] = True
        return b""

    monkeypatch.setattr(image_svc, "generate_image", fake_generate)

    async def fake_get(**kw):
        return {"id": "a", "type": "character", "name": "小明", "description": "旧"}

    async def fake_update_desc(**kw):
        return True

    monkeypatch.setattr(assets_repo, "get_character_asset", fake_get)
    monkeypatch.setattr(assets_repo, "update_asset_description", fake_update_desc)
    _stub_llm(monkeypatch, "新设定")

    out = await ai_svc.optimize_character(
        team_id=TEAM, user_id=USER, project_id="p", asset_id="a",
        instruction="更冷", generate_avatar=False,
    )

    assert out["description"] == "新设定"
    assert not image_touched["v"]
