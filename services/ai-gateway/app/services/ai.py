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


# ---- 多模态调用 (文本 + 参考图) ----

# spike 教训 + 防超限: 限制图片数量与单图大小, 过小/损坏图跳过.
MAX_REF_IMAGES = 4
MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 单图 4MB 上限
MIN_IMAGE_BYTES = 128              # 过小(退化)图上游会 400, 跳过


async def _anthropic_once_multimodal(
    prompt: str, system: str, images: list[dict], max_tokens: int = 2000,
) -> tuple[str, int, int]:
    """带参考图的调用. images: [{"media_type": "image/png", "data": <base64>}].
    images 为空时等价于纯文本(但调用方一般直接走 _anthropic_once)。"""
    client = _client()
    s = get_settings()
    content: list[dict] = [
        {"type": "image", "source": {"type": "base64", "media_type": im["media_type"], "data": im["data"]}}
        for im in images
    ]
    content.append({"type": "text", "text": prompt})
    msg = await client.messages.create(
        model=s.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
    )
    text = "".join(block.text for block in msg.content if block.type == "text")
    return text, msg.usage.input_tokens, msg.usage.output_tokens


async def _fetch_project_reference_images(project_id: str, team_id: str, role: str = "character_ref") -> list[dict]:
    """取项目参考图喂模型用. 用 S2S token 调 asset-service 列资产 → 下载 → 校验 → base64.
    任何失败都返回空列表(调用方据此降级为纯文本), 不抛异常 — 参考图不应搞挂主流程。
    返回 [{"media_type": ..., "data": <base64>}], 最多 MAX_REF_IMAGES 张。"""
    import base64
    from .. import internal_token

    if not internal_token.has_s2s():
        logger.warning("S2S token 不可用, 跳过参考图(降级纯文本)")
        return []
    s = get_settings()
    out: list[dict] = []
    try:
        token = internal_token.mint_s2s_token(team_id)
        async with httpx.AsyncClient(timeout=10) as c:
            # 按 project_id + role 精确取关联资产(走 project_assets 接口)
            resp = await c.get(
                f"{s.asset_service_url}/v1/projects/{project_id}/assets",
                params={"role": role},
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            assets = resp.json().get("data", [])
            for a in assets[:MAX_REF_IMAGES]:
                url = a.get("file_url") or a.get("thumbnail_url")
                if not url:
                    continue
                try:
                    img = await c.get(url)
                    img.raise_for_status()
                    raw = img.content
                    if not (MIN_IMAGE_BYTES <= len(raw) <= MAX_IMAGE_BYTES):
                        logger.warning(f"参考图大小越界({len(raw)}B), 跳过: {a.get('id')}")
                        continue
                    media = img.headers.get("content-type", "image/png").split(";")[0]
                    if not media.startswith("image/"):
                        media = "image/png"
                    out.append({"media_type": media, "data": base64.standard_b64encode(raw).decode()})
                except Exception as e:  # 单图下载失败不影响其他
                    logger.warning(f"参考图下载失败, 跳过 {a.get('id')}: {e}")
    except Exception as e:
        logger.warning(f"取项目参考图失败(降级纯文本): {e}")
        return []
    return out


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

    # 取项目角色参考图(失败/无图均返回空 → 降级纯文本, 不阻断)
    ref_images = await _fetch_project_reference_images(project_id, team_id, role="character_ref")

    prompt = (
        f"项目 ID: {project_id}\n"
        f"风格: {style}\n"
        f"regenerate_all: {regenerate_all}\n"
        f"shot_ids: {shot_ids or '(无)'}\n\n"
        + ("已提供角色参考图, 生成分镜时请保持角色外观与参考图一致。\n\n" if ref_images else "")
        + "请生成 3-6 个分镜。"
    )

    start = time.monotonic()
    try:
        if ref_images:
            text, in_tok, out_tok = await _anthropic_once_multimodal(
                prompt, STORYBOARD_SYSTEM, ref_images, max_tokens=6000
            )
        else:
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


# ---- 6. chat (对话 agent: 意图分析 + 动态选项 + 触发制作动作) ----

CHAT_SYSTEM = """你是「漫剧AI」的创作搭档 Agent，陪用户从一个想法一步步做出短片。

你的工作方式：分析用户最新一句话 + 对话历史 + 当前项目状态 + 当前阶段，决定这一轮怎么回应。
你不是填表机器人。不要机械地一个个盘问。像一个有经验的导演搭档那样自然地聊，
在聊的过程中把需要的信息顺势抽取出来。全程保持同一种口吻：自然、口语，
不要在某些阶段突然变成「点下一步」式的向导。

创作管线分 5 个阶段：idea(找方向) → script(剧本) → storyboard(分镜) → voice(配音) → video(成片)。
你要根据「当前阶段」调整聊天重点，并在用户表达推进意图时触发「当前阶段对应」的制作动作。

各阶段聊什么：
- idea：顺势聊出题材/风格/时长/受众/情绪基调，不要逐项盘问。
- script：聊剧情走向、冲突、节奏、开场抓人，回应用户对方向的偏好与修改。
- storyboard：聊镜头切分、景别、画面风格、单镜时长松紧。
- voice：聊角色音色、旁白语气、配音节奏。
- video：聊整体节奏、转场、片尾停顿，以及成片导出。

每一轮你必须输出严格的 JSON（不要任何额外解释、不要 markdown 代码块包裹）：
{
  "thinking": "你的简短推理（给用户看的思考过程，1-2句，可空字符串）",
  "reply": "你要对用户说的话（自然、口语、不超过3句）",
  "options": [{"label": "显示文字", "value": "回填到对话的值"}],
  "extracted": {"type": "...", "style": "...", "duration": "...", "audience": "...", "theme": "...", "tone": "..."},
  "trigger": null
}

options 规则（关键）：
- options 是「快捷回复建议」，由你根据当前对话动态生成，帮用户省打字。不是必须的。
- 当用户的话已经很明确、或在自由发挥时，options 给空数组 []，让他继续自由说。
- 当你在帮他收敛方向（比如问风格倾向）时，给 2-4 个贴合当前题材的具体选项。
- options 永远不要重复用户已经说过的信息。

extracted 规则：
- 只填你从「整个对话」里确信的字段，没提到的字段不要瞎填，留空或省略。
- 这是累积的项目设定，前端会合并保存。

trigger 规则（什么时候推进到下一步 / 触发制作动作）：
- 大多数时候是 null（继续对话）。只在用户明确表达推进意图（「开始/可以了/生成吧/就这样/下一步」）
  且当前阶段信息已足够时，才输出 trigger。不要催，也不要自作主张替用户推进。
- 关键约束：每个阶段「只允许」它对应的那一个 action，绝不能跨阶段触发：
    · stage=idea       → 只允许 {"action": "generate_script"}（且至少已有题材方向）
    · stage=script     → 只允许 {"action": "generate_storyboard"}（且用户已认可某个剧本方向）
    · stage=storyboard → 只允许 {"action": "match_voice"}（且分镜已就绪）
    · stage=voice      → 只允许 {"action": "render_video"}（且配音已完成）
    · stage=video      → 不允许任何 trigger，始终为 null（已是最后一步，聊调整即可）
- action 形如 {"action": "generate_storyboard", "params": {}}。拿不准就给 null，让对话继续。"""


async def chat_respond(
    *,
    team_id: str,
    user_id: str,
    project_id: str | None,
    stage: str,
    messages: list[dict],
    context: dict,
) -> dict:
    """对话 agent: 一次 LLM 调用，返回结构化的一轮响应。

    messages: [{"role": "user"|"assistant", "content": "..."}]
    context: {"has_script": bool, "has_shots": bool, "idea": {...}}
    """
    convo = "\n".join(
        f"{'用户' if m.get('role') == 'user' else 'AI'}: {m.get('content', '')}"
        for m in messages[-12:]
    )
    prompt = (
        f"当前阶段: {stage}\n"
        f"项目状态: 已有剧本={context.get('has_script', False)}, "
        f"已有分镜={context.get('has_shots', False)}, "
        f"已配音={context.get('has_voice', False)}, "
        f"已出片={context.get('has_video', False)}\n"
        f"已收集的创意设定: {json.dumps(context.get('idea', {}), ensure_ascii=False)}\n\n"
        f"对话历史:\n{convo}\n\n"
        f"请按系统提示输出这一轮的 JSON 响应。"
    )
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="chat",
        system=CHAT_SYSTEM,
        prompt=prompt,
        max_tokens=1200, parse_json=True,
    )
    if not isinstance(result, dict):
        result = {}
    # 兜底：保证字段齐全，前端不必做防御
    return {
        "thinking": result.get("thinking", ""),
        "reply": result.get("reply") or "嗯，我在听，继续说说你的想法？",
        "options": result.get("options") if isinstance(result.get("options"), list) else [],
        "extracted": result.get("extracted") if isinstance(result.get("extracted"), dict) else {},
        "trigger": result.get("trigger"),
    }


# ---- 6b. intent/classify (后续阶段自由输入的意图分类) ----

INTENT_CLASSIFY_SYSTEM = """你是漫剧创作流程里的意图分类器。用户在某个制作阶段自由输入了一句话，
你要判断他的意图，并提取参数。只返回严格 JSON，不要任何解释。

输出格式:
{
  "intent": "continue | skip | modify | back | off_topic | clarify",
  "params": {"value": "...", "target_node": "...", "skip_to": "...", "question": "..."},
  "confidence": 0.0-1.0
}

意图含义:
- continue: 认可当前步骤/想推进。params.value 填提取到的选择值。
- skip: 想跳过当前步骤直接往后。params.skip_to 填目标阶段名。
- modify: 想修改某个已生成的内容/节点。params.target_node 填目标。
- back: 想返回上一步/退出当前编辑。
- off_topic: 跟创作无关。
- clarify: 表达不清，需要追问。params.question 填要追问的话。

params 里只填确信的字段，不确定就省略。"""


async def intent_classify(
    *,
    team_id: str,
    user_id: str,
    message: str,
    stage: str,
    step: str,
    context: str,
) -> dict:
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=None,
        task_type="intent.classify",
        system=INTENT_CLASSIFY_SYSTEM,
        prompt=(
            f"当前阶段: {stage}\n当前步骤: {step}\n"
            f"最近对话: {context}\n\n用户输入: {message}"
        ),
        max_tokens=400, parse_json=True,
    )
    if not isinstance(result, dict):
        result = {}
    return {
        "intent": result.get("intent", "clarify"),
        "params": result.get("params") if isinstance(result.get("params"), dict) else {},
        "confidence": result.get("confidence", 0.0),
    }


# ---- 6c. title/generate (对话标题: 由用户首句生成简短标题) ----

TITLE_SYSTEM = """你是「漫剧AI」的标题助手。用户刚说出他想做的短片的第一句话（一个灵感/画面/念头）。
请据此为这个创作项目起一个简短、好记、有画面感的中文标题。

要求：
- 只输出标题本身，不要任何解释、引号、标点结尾、书名号。
- 6-14 个字为宜，最长不超过 16 字。
- 概括核心创意，不要照抄原话，也不要太抽象。
- 如果用户的话信息太少，就起一个贴合氛围的名字，不要留空。"""


def _clean_title(raw: str) -> str:
    """清理 LLM 返回的标题: 去首尾空白/引号/书名号, 取首行, 限长 16 字."""
    t = (raw or "").strip().splitlines()[0] if (raw or "").strip() else ""
    t = t.strip().strip("\"'“”《》「」 \t").strip()
    # 去掉可能的 "标题：" 前缀
    t = re.sub(r"^(标题|题目|片名)[:：]\s*", "", t).strip()
    return t[:16]


async def generate_title(
    *,
    team_id: str,
    user_id: str,
    project_id: str | None,
    message: str,
) -> dict:
    """根据用户第一句话生成一个简短的项目/对话标题. 返回 {"title": "..."}."""
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="title.generate",
        system=TITLE_SYSTEM,
        prompt=f"用户的第一句话:\n{message}\n\n请只输出标题。",
        max_tokens=40, parse_json=False,
    )
    raw = result.get("text", "") if isinstance(result, dict) else str(result)
    return {"title": _clean_title(raw)}


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


# ---- 9. 单节点优化(canvas-node-optimize-panel): 专门端点,不复用 chat_respond ----
# 三者都走 _run_and_record(parse_json=False) 拿 LLM 文本, 再直写共享库(team_ctx)。
# 仅文本类优化可用:图像重生成(分镜重画/角色头像)需图像模型,本项目未接入 → 二期。

REWRITE_SCENE_SYSTEM = """你是短剧编剧 AI。用户要优化剧本里的「某一场」。
只重写这一场的正文,保持与全剧风格一致。严格要求:
- 只输出这一场的正文本身,不要场景标题,不要编号,不要任何解释或 markdown 代码块。
- 不要输出其它场的内容。"""

SHOT_DIALOG_SYSTEM = """你是分镜对白 AI。用户要优化「某一镜」的对白。
只输出这一镜修改后的对白纯文本,不要镜号/标题/解释/引号包裹。"""

CHARACTER_SYSTEM = """你是角色设定 AI。用户要优化「某个角色」的设定/描述。
只输出修改后的角色描述纯文本,不要名字前缀/解释/markdown。"""


def _text_of(result: Any) -> str:
    return (result.get("text") if isinstance(result, dict) else str(result)).strip()


async def rewrite_scene(
    *, team_id: str, user_id: str, project_id: str, scene_index: int, instruction: str,
) -> dict:
    """精准单场重写:定位该场 → LLM 仅重写该场 → 原子替换 → 乐观版本写回。"""
    from ..repo import scripts as scripts_repo
    from ..scene_split import replace_scene, split_scenes

    script = await scripts_repo.get_script(team_id=team_id, user_id=user_id, project_id=project_id)
    if script is None:
        raise HTTPException(status_code=404, detail={"code": "SCRIPT_NOT_FOUND", "message": "该项目还没有剧本"})
    scenes = split_scenes(script["content"])
    if scene_index < 0 or scene_index >= len(scenes):
        raise HTTPException(
            status_code=400,
            detail={"code": "SCENE_INDEX_OUT_OF_RANGE", "message": f"scene_index {scene_index} 越界(共 {len(scenes)} 场)"},
        )
    target = scenes[scene_index]
    prompt = (
        f"全剧共 {len(scenes)} 场。要优化第 {scene_index + 1} 场「{target.title}」。\n\n"
        f"这一场当前正文:\n{target.content}\n\n"
        f"---\n优化指令: {instruction}\n\n只输出这一场修改后的正文。"
    )
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="script.rewrite_scene", system=REWRITE_SCENE_SYSTEM,
        prompt=prompt, max_tokens=2000, parse_json=False,
    )
    new_body = _text_of(result)
    if not new_body:
        raise HTTPException(status_code=502, detail={"code": "AI_EMPTY_RESULT", "message": "AI 返回为空"})
    new_content = replace_scene(script["content"], scene_index, new_body)
    new_version = await scripts_repo.update_script_content(
        team_id=team_id, user_id=user_id, project_id=project_id,
        content=new_content, expected_version_no=script["version_no"],
    )
    if new_version is None:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "message": "剧本已被改动,请刷新后重试"})
    return {"content": new_content, "version_no": new_version}


async def _generate_and_save_image(
    *, team_id: str, user_id: str, project_id: str, prompt: str, size: str, purpose: str, filename: str,
) -> str:
    """图像生成 + 上传共享流程:配额 check → 拉参考图 → 生图 → 上传 → 消耗配额。

    canvas-image-generation Decision 3+4+6:
    - check_and_reserve 在生图前(失败的真生图前就拒)
    - failures(上游/上传)不调 consume(失败不计配额)
    - consume 仅在落地写回前调用,确保配额账实匹配
    """
    from ..repo import image_quota
    from . import image as image_svc

    month = image_quota.current_month_yymm()
    try:
        await image_quota.check_and_reserve(team_id=team_id, user_id=user_id, month_yymm=month)
    except image_quota.QuotaExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "IMAGE_QUOTA_EXCEEDED",
                "message": f"本月图像额度已用完({e.used}/{e.limit}),下月恢复",
            },
        )

    refs = await _fetch_project_reference_images(project_id, team_id, role="character_ref")
    img_bytes = await image_svc.generate_image(prompt=prompt, size=size, reference_images=refs)
    file_url = await image_svc.upload_to_asset_service(
        team_id=team_id, content=img_bytes, content_type="image/png",
        purpose=purpose, filename=filename,
    )
    await image_quota.consume(team_id=team_id, user_id=user_id, month_yymm=month)
    return file_url


async def optimize_shot(
    *, team_id: str, user_id: str, project_id: str, shot_id: str,
    instruction: str, ref_image_url: str | None, mode: str,
) -> dict:
    """单镜优化:
    - mode=text → LLM 改对白
    - mode=image → gpt-image-1 重画这一镜(配额 + 参考图)
    - mode=both → 先 text 后 image,**两者独立**:任一失败已成功部分保留,失败 raise 该步错误
    """
    from ..repo import shots as shots_repo

    if mode not in ("text", "image", "both"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "mode 必须是 text|image|both"})

    shot = await shots_repo.get_shot(team_id=team_id, user_id=user_id, shot_id=shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail={"code": "SHOT_NOT_FOUND", "message": "分镜不存在"})

    new_dialog = shot.get("dialog")
    new_image_url = shot.get("image_url")

    if mode in ("text", "both"):
        prompt_text = (
            f"这一镜标题: {shot.get('title') or '(无)'}\n"
            f"当前对白: {shot.get('dialog') or '(无)'}\n\n"
            f"---\n优化指令: {instruction}\n\n只输出这一镜修改后的对白。"
        )
        result, _ = await _run_and_record(
            team_id=team_id, user_id=user_id, project_id=project_id,
            task_type="shot.optimize", system=SHOT_DIALOG_SYSTEM,
            prompt=prompt_text, max_tokens=800, parse_json=False,
        )
        new_dialog = _text_of(result)
        await shots_repo.update_shot_dialog(
            team_id=team_id, user_id=user_id, shot_id=shot_id, dialog=new_dialog,
        )

    if mode in ("image", "both"):
        img_prompt = (
            f"为漫剧分镜生成画面。\n"
            f"镜头标题: {shot.get('title') or '(无)'}\n"
            f"镜头对白: {new_dialog or '(无)'}\n"
            f"画面要求: {instruction}\n"
            f"风格: 漫剧 / 动漫"
        )
        new_image_url = await _generate_and_save_image(
            team_id=team_id, user_id=user_id, project_id=project_id,
            prompt=img_prompt, size="1792x1024",
            purpose="shot-image", filename=f"shot-{shot_id}.png",
        )
        await shots_repo.update_shot_image(
            team_id=team_id, user_id=user_id, shot_id=shot_id, image_url=new_image_url,
        )

    return {"shot_id": shot_id, "dialog": new_dialog, "image_url": new_image_url}


async def optimize_character(
    *, team_id: str, user_id: str, project_id: str, asset_id: str,
    instruction: str, generate_avatar: bool = False,
) -> dict:
    """单角色优化:
    - generate_avatar=False(默认)→ LLM 改写设定 / 描述
    - generate_avatar=True → gpt-image-1 生成头像(1024x1024),覆盖 assets.file_url
    """
    from ..repo import assets as assets_repo

    asset = await assets_repo.get_character_asset(team_id=team_id, user_id=user_id, asset_id=asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "角色资产不存在"})
    if asset.get("type") != "character":
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "该资产不是角色"})

    if generate_avatar:
        img_prompt = (
            f"为漫剧角色生成头像。\n"
            f"角色名: {asset.get('name')}\n"
            f"角色设定: {asset.get('description') or '(无)'}\n"
            f"画面要求: {instruction}\n"
            f"风格: 漫剧 / 动漫,头像构图,正方画幅"
        )
        file_url = await _generate_and_save_image(
            team_id=team_id, user_id=user_id, project_id=project_id,
            prompt=img_prompt, size="1024x1024",
            purpose="character-avatar", filename=f"char-{asset_id}.png",
        )
        saved = await assets_repo.update_asset_file_url(
            team_id=team_id, user_id=user_id, asset_id=asset_id, file_url=file_url,
        )
        if saved is None:
            raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "角色资产不存在或已删除"})
        return {"asset_id": asset_id, "description": asset.get("description"), "file_url": file_url}

    # 默认:改 description(沿用现有行为)
    prompt = (
        f"角色名: {asset.get('name')}\n"
        f"当前设定/描述: {asset.get('description') or '(无)'}\n\n"
        f"---\n优化指令: {instruction}\n\n只输出修改后的角色描述。"
    )
    result, _ = await _run_and_record(
        team_id=team_id, user_id=user_id, project_id=project_id,
        task_type="character.optimize", system=CHARACTER_SYSTEM,
        prompt=prompt, max_tokens=800, parse_json=False,
    )
    new_desc = _text_of(result)
    saved = await assets_repo.update_asset_description(
        team_id=team_id, user_id=user_id, asset_id=asset_id, description=new_desc,
    )
    if not saved:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "角色资产不存在或已删除"})
    return {"asset_id": asset_id, "description": new_desc, "file_url": asset.get("file_url")}
