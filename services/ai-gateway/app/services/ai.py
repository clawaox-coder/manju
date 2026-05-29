"""ai-gateway 业务层. 每个端点都:
  1. INSERT ai_tasks (status='queued' 或 'running')
  2. 调 Anthropic
  3. UPDATE ai_tasks (usage / result / done)
  4. 返结果

无 ANTHROPIC_API_KEY (默认 'sk-placeholder') 时, 直接抛 503 — 不内置 mock 回退.

异步端点 (storyboard/generate) 走 FastAPI BackgroundTasks: 立即返 task_id, 后台跑.
"""

from __future__ import annotations
import json
import logging
import re
import time
from typing import Any, AsyncGenerator

import anthropic
import httpx
from fastapi import HTTPException

from .. config import get_settings
from ..repo import tasks as tasks_repo
from ..repo import shots as shots_repo

logger = logging.getLogger("ai-gateway.services")

PROVIDER = "anthropic"


# ---- shared anthropic call helper ----

def _client() -> anthropic.AsyncAnthropic:
    s = get_settings()
    if not s.has_real_anthropic_key:
        # 519 也合适, 但 fastapi 默认接受任意 3-5xx. 用 503 = service unavailable.
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_PROVIDER_UNAVAILABLE",
                "message": "AI provider 未配置: 请设置 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN",
            },
        )
    kwargs: dict[str, Any] = {}
    if s.anthropic_base_url:
        kwargs["base_url"] = s.anthropic_base_url
    # auth_token 优先 (OAuth/中转模式), 否则走 api_key.
    if s.anthropic_auth_token:
        kwargs["auth_token"] = s.anthropic_auth_token
    else:
        kwargs["api_key"] = s.anthropic_api_key
    # 启用 1m 上下文 beta (Opus 4.7 默认行为, 中转要求显式 flag).
    if s.anthropic_beta:
        kwargs["default_headers"] = {"anthropic-beta": s.anthropic_beta}
    return anthropic.AsyncAnthropic(**kwargs)


async def _anthropic_once(prompt: str, system: str, max_tokens: int = 2000) -> tuple[str, int, int]:
    """同步调用 Anthropic, 返 (text, input_tokens, output_tokens)."""
    client = _client()
    s = get_settings()
    msg = await client.messages.create(
        model=s.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in msg.content if block.type == "text")
    return text, msg.usage.input_tokens, msg.usage.output_tokens


def _strip_trailing_commas(s: str) -> str:
    """删掉结构性尾逗号 (',' 紧跟 '}' 或 ']'). 仅在严格 loads 失败后调用,
    所以合法 JSON (含字符串里的 ',]') 不会走到这, 不必担心误伤字符串内容."""
    return re.sub(r",(\s*[}\]])", r"\1", s)


def _loads_tolerant(s: str) -> Any:
    """先严格 loads; 失败再容忍尾逗号重试."""
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return json.loads(_strip_trailing_commas(s))


def _parse_json_loose(text: str) -> Any:
    """从 LLM 输出中提 JSON. 容忍 ```json ... ``` 包裹与前后散文, 以及结构性尾逗号.

    策略: 找最先出现的 '{' 或 '[', 然后向后找匹配的 '}' 或 ']'.
    优先级按"先出现"决定, 避免 '回答:\\n[{...}]' 被里面的 '{' 误吃成 object.
    """
    text = text.strip()
    # 先看哪个开始符更早
    first_obj = text.find("{")
    first_arr = text.find("[")

    candidates: list[tuple[int, str, str]] = []
    if first_obj >= 0:
        candidates.append((first_obj, "{", "}"))
    if first_arr >= 0:
        candidates.append((first_arr, "[", "]"))
    candidates.sort()

    for _, opener, closer in candidates:
        i = text.find(opener)
        j = text.rfind(closer)
        if j > i:
            try:
                return _loads_tolerant(text[i : j + 1])
            except json.JSONDecodeError:
                continue
    # 退而求其次: 直接 loads
    return _loads_tolerant(text)


async def _run_and_record(
    *,
    team_id: str,
    user_id: str,
    project_id: str | None,
    task_type: str,
    system: str,
    prompt: str,
    max_tokens: int = 2000,
    parse_json: bool = False,
) -> tuple[Any, tasks_repo.AITask]:
    """通用同步任务: create_task(running) → call → update(succeeded/failed) → 返 (result, task).

    result: parse_json=True 时是解析后的 dict/list; 否则是 raw text.
    """
    s = get_settings()
    task = await tasks_repo.create_task(
        team_id=team_id,
        user_id=user_id,
        project_id=project_id,
        task_type=task_type,
        provider=PROVIDER,
        model=s.anthropic_model,
        status="running",
    )

    start = time.monotonic()
    try:
        text, in_tok, out_tok = await _anthropic_once(prompt, system, max_tokens=max_tokens)
        result: Any
        if parse_json:
            try:
                result = _parse_json_loose(text)
            except json.JSONDecodeError as e:
                logger.warning(f"ai response not parseable JSON: {e}; raw={text[:200]}")
                result = {"raw_text": text, "parse_error": str(e)}
        else:
            result = {"text": text}

        duration_ms = int((time.monotonic() - start) * 1000)
        updated = await tasks_repo.update_task_status(
            team_id=team_id,
            user_id=user_id,
            task_id=task.id,
            status="succeeded",
            input_tokens=in_tok,
            output_tokens=out_tok,
            duration_ms=duration_ms,
            result_data=result if isinstance(result, dict) else {"data": result},
            done=True,
        )
        return result, updated or task
    except HTTPException as he:
        # HTTPException 来自上游 (如无 key 的 503), task 也要标 failed
        duration_ms = int((time.monotonic() - start) * 1000)
        await tasks_repo.update_task_status(
            team_id=team_id,
            user_id=user_id,
            task_id=task.id,
            status="failed",
            duration_ms=duration_ms,
            error=f"{he.status_code}: {he.detail}",
            done=True,
        )
        raise
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        await tasks_repo.update_task_status(
            team_id=team_id,
            user_id=user_id,
            task_id=task.id,
            status="failed",
            duration_ms=duration_ms,
            error=str(e),
            done=True,
        )
        raise HTTPException(
            status_code=502,
            detail={"code": "AI_PROVIDER_ERROR", "message": str(e), "task_id": str(task.id)},
        )


# ---- 1. script/continue (SSE 流式, 已有的扩展版) ----

SCRIPT_CONTINUE_SYSTEM = """你是一个专业的短剧编剧 AI 助手。根据用户提供的剧本上下文和指令，续写剧本内容。
要求：
- 保持与上下文一致的风格和语气
- 使用 Markdown 格式（## 表示场景标题）
- 对话用引号包裹
- 每个场景包含场景描述和角色对话
- 续写 1-3 个场景"""


async def stream_script_continue(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    context_text: str,
    instruction: str,
) -> AsyncGenerator[dict, None]:
    """SSE 流: yield {event, data} dict 给 EventSourceResponse."""
    s = get_settings()
    task = await tasks_repo.create_task(
        team_id=team_id,
        user_id=user_id,
        project_id=project_id,
        task_type="script.continue",
        provider=PROVIDER,
        model=s.anthropic_model,
        status="running",
    )

    yield {"event": "start", "data": json.dumps({"task_id": str(task.id)})}

    if not s.has_real_anthropic_key:
        await tasks_repo.update_task_status(
            team_id=team_id, user_id=user_id, task_id=task.id, status="failed",
            error="AI provider 未配置", done=True,
        )
        yield {
            "event": "error",
            "data": json.dumps(
                {"code": "AI_PROVIDER_UNAVAILABLE", "message": "请配置 ANTHROPIC_API_KEY"},
                ensure_ascii=False,
            ),
        }
        return

    start = time.monotonic()
    full_text_parts: list[str] = []
    try:
        client = _client()
        async with client.messages.stream(
            model=s.anthropic_model,
            max_tokens=2000,
            system=SCRIPT_CONTINUE_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"当前剧本内容:\n{context_text}\n\n---\n指令: {instruction}",
                }
            ],
        ) as stream:
            async for text in stream.text_stream:
                full_text_parts.append(text)
                yield {"event": "delta", "data": json.dumps({"text": text}, ensure_ascii=False)}

            message = await stream.get_final_message()
            duration_ms = int((time.monotonic() - start) * 1000)
            await tasks_repo.update_task_status(
                team_id=team_id, user_id=user_id, task_id=task.id,
                status="succeeded",
                input_tokens=message.usage.input_tokens,
                output_tokens=message.usage.output_tokens,
                duration_ms=duration_ms,
                result_data={"text": "".join(full_text_parts)},
                done=True,
            )
            yield {
                "event": "done",
                "data": json.dumps({
                    "task_id": str(task.id),
                    "usage": {
                        "input_tokens": message.usage.input_tokens,
                        "output_tokens": message.usage.output_tokens,
                    },
                }),
            }
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        await tasks_repo.update_task_status(
            team_id=team_id, user_id=user_id, task_id=task.id, status="failed",
            duration_ms=duration_ms, error=str(e), done=True,
        )
        yield {
            "event": "error",
            "data": json.dumps(
                {"code": "AI_PROVIDER_ERROR", "message": str(e), "task_id": str(task.id)},
                ensure_ascii=False,
            ),
        }


# ---- 2. storyboard/generate (异步) ----

STORYBOARD_SYSTEM = """你是一个分镜设计 AI 助手。根据剧本内容生成分镜列表。
输出 JSON 数组, 每个元素含字段:
- title: 分镜标题 (string)
- shot_type: 镜头类型 (close-up | medium | wide | bird-eye 等)
- duration_ms: 时长 (int, 毫秒)
- bg_style: 背景风格 (string, 可空)
- dialog: 对白 (string, 可空)
- description: 画面描述 (string)
只返回 JSON, 不要其他解释。"""


async def storyboard_generate_async(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    style: str,
    shot_ids: list[str] | None,
    regenerate_all: bool,
    task_id: str,
) -> None:
    """后台跑分镜生成. 由 BackgroundTasks 调度, 错误自己消化 (写 ai_tasks.error)."""
    from uuid import UUID as _UUID
    s = get_settings()

    prompt = (
        f"项目 ID: {project_id}\n"
        f"风格: {style}\n"
        f"regenerate_all: {regenerate_all}\n"
        f"shot_ids: {shot_ids or '(无)'}\n\n"
        "请生成 3-6 个分镜。"
    )

    start = time.monotonic()
    try:
        text, in_tok, out_tok = await _anthropic_once(
            prompt, STORYBOARD_SYSTEM, max_tokens=6000
        )
        try:
            parsed = _parse_json_loose(text)
        except json.JSONDecodeError as e:
            parsed = None
            parse_error = str(e)

        shots = []
        if parsed is not None:
            shots = parsed if isinstance(parsed, list) else [parsed]
            shots = [s for s in shots if isinstance(s, dict)]

        duration_ms = int((time.monotonic() - start) * 1000)

        if not shots:
            # 解析失败 / 空结果 — 显式标 failed, 别静默成 succeeded
            await tasks_repo.update_task_status(
                team_id=team_id, user_id=user_id,
                task_id=_UUID(task_id),
                status="failed",
                input_tokens=in_tok, output_tokens=out_tok,
                duration_ms=duration_ms,
                error=f"分镜解析失败或为空: {parse_error if parsed is None else 'no shots'}",
                done=True,
            )
            return

        # 持久化到 shots 表 (script-service 共享库)
        n = await shots_repo.replace_project_shots(
            team_id=team_id, user_id=user_id, project_id=project_id,
            shots=shots, style=style,
        )
        await tasks_repo.update_task_status(
            team_id=team_id, user_id=user_id,
            task_id=_UUID(task_id),
            status="succeeded",
            input_tokens=in_tok, output_tokens=out_tok,
            duration_ms=duration_ms,
            result_data={"shots_count": n, "style": style},
            done=True,
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        await tasks_repo.update_task_status(
            team_id=team_id, user_id=user_id,
            task_id=_UUID(task_id),
            status="failed",
            duration_ms=duration_ms, error=str(e), done=True,
        )


# ---- 3. consistency/check ----

CONSISTENCY_CHECK_SYSTEM = """你是一个剧本一致性检查 AI 助手。检查角色名、设定、剧情有无前后矛盾。
输出 JSON:
{
  "avg_score": 0-100 整数,
  "total_issues": 整数,
  "characters": [
    {"name": "角色名", "issues": ["问题1", ...], "score": 0-100}
  ]
}
只返回 JSON, 不要其他解释。"""


async def consistency_check(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    content: str,
) -> dict:
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="consistency.check",
        system=CONSISTENCY_CHECK_SYSTEM,
        prompt=f"剧本内容:\n{content}",
        max_tokens=2000, parse_json=True,
    )
    return result


# ---- 4. consistency/fix ----

CONSISTENCY_FIX_SYSTEM = """你是一个剧本修复 AI 助手。根据指定角色名和问题, 给出修复后的剧本片段。
输出 JSON:
{
  "fixed_content": "修复后的完整剧本片段",
  "changes": ["修改说明1", ...]
}
只返回 JSON。"""


async def consistency_fix(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    content: str,
    character_name: str,
    issue_index: int,
) -> dict:
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="consistency.fix",
        system=CONSISTENCY_FIX_SYSTEM,
        prompt=(
            f"剧本内容:\n{content}\n\n"
            f"---\n"
            f"修复角色: {character_name}\n"
            f"修复问题序号: {issue_index}\n"
        ),
        max_tokens=3000, parse_json=True,
    )
    return result


# ---- 5. voice/match ----

VOICE_MATCH_SYSTEM = """你是一个配音匹配 AI 助手。根据角色描述, 推荐合适的语音风格 (性别 / 年龄段 / 性格 / 情感).
输出 JSON:
{
  "matches": [
    {"character_name": "...", "voice_profile": {"gender": "male|female", "age": "young|mid|old", "tone": "..."}, "confidence": 0-1}
  ]
}
只返回 JSON。"""


async def voice_match(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    content: str,
    auto_assign: bool,
) -> dict:
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="voice.match",
        system=VOICE_MATCH_SYSTEM,
        prompt=f"剧本:\n{content}\n\nauto_assign: {auto_assign}",
        max_tokens=1500, parse_json=True,
    )
    return result


# ---- 7. TTS (OpenAI) ----

VALID_TTS_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}


async def tts_generate(
    *,
    text: str,
    voice: str,
    speed: float = 1.0,
) -> bytes:
    """调用 OpenAI TTS API, 返回 mp3 bytes.

    无 OPENAI_API_KEY 时返回 503.
    """
    s = get_settings()
    if not s.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "TTS_PROVIDER_UNAVAILABLE",
                "message": "TTS 未配置: 请设置 OPENAI_API_KEY",
            },
        )

    if voice not in VALID_TTS_VOICES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_VOICE",
                "message": f"voice 必须是 {sorted(VALID_TTS_VOICES)} 之一",
            },
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {s.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": text,
                    "voice": voice,
                    "speed": speed,
                    "response_format": "mp3",
                },
            )
            if resp.status_code != 200:
                logger.error(
                    f"OpenAI TTS error: {resp.status_code} {resp.text[:200]}"
                )
                raise HTTPException(
                    status_code=502,
                    detail={
                        "code": "TTS_UPSTREAM_ERROR",
                        "message": f"OpenAI TTS 返回 {resp.status_code}",
                    },
                )
            return resp.content
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail={"code": "TTS_NETWORK_ERROR", "message": str(e)},
            )

EDIT_AUTO_SYSTEM = """你是一个剪辑参数生成 AI 助手。根据剧本风格和参数, 给出剪辑 preset 建议。
输出 JSON:
{
  "transitions": ["类型/时长", ...],
  "bgm": {"mood": "...", "intensity": 0-1},
  "subtitle": {"style": "...", "position": "..."},
  "pacing": {"shot_durations_ms": [...]}
}
只返回 JSON。"""


async def edit_auto(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    preset: str,
    params: dict,
) -> dict:
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="edit.auto",
        system=EDIT_AUTO_SYSTEM,
        prompt=(
            f"项目 ID: {project_id}\n"
            f"预设: {preset}\n"
            f"参数: {json.dumps(params, ensure_ascii=False)}"
        ),
        max_tokens=1500, parse_json=True,
    )
    return result
