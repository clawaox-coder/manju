"""ai-gateway 7 端点 + GET /tasks/:id."""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..auth import AuthContext, require_auth
from ..config import get_settings
from ..repo import tasks as tasks_repo
from ..services import ai as ai_svc

router = APIRouter()


def _require_write(auth: AuthContext) -> None:
    if auth.role == "viewer":
        raise HTTPException(
            status_code=403,
            detail={"code": "INSUFFICIENT_PERMISSION", "message": "viewer 只读, 无写权限"},
        )


# ---- DTO ----

def task_to_dto(t: tasks_repo.AITask) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "team_id": str(t.team_id),
        "user_id": str(t.user_id),
        "project_id": str(t.project_id) if t.project_id else None,
        "task_type": t.task_type,
        "provider": t.provider,
        "model": t.model,
        "status": t.status,
        "input_tokens": t.input_tokens,
        "output_tokens": t.output_tokens,
        "duration_ms": t.duration_ms,
        "result_data": t.result_data,
        "result_url": t.result_url,
        "error": t.error,
        "cached": t.cached,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "done_at": t.done_at.isoformat() if t.done_at else None,
    }


# ---- 1. POST /v1/ai/script/continue (SSE) ----

class ScriptContinueRequest(BaseModel):
    project_id: str
    context: str
    instruction: str = Field(min_length=1)


@router.post("/script/continue")
async def script_continue(
    body: ScriptContinueRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)

    async def event_generator():
        async for event in ai_svc.stream_script_continue(
            team_id=auth.team_id,
            user_id=auth.user_id,
            project_id=body.project_id,
            context_text=body.context,
            instruction=body.instruction,
        ):
            yield event

    return EventSourceResponse(event_generator())


# ---- 2. POST /v1/ai/storyboard/generate (异步) ----

class StoryboardGenerateRequest(BaseModel):
    project_id: str
    style: str = "default"
    shot_ids: list[str] | None = None
    regenerate_all: bool = False
    with_images: bool = True


@router.post("/storyboard/generate")
async def storyboard_generate(
    body: StoryboardGenerateRequest,
    background_tasks: BackgroundTasks,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    settings = get_settings()

    # 先入队: status='queued'
    task = await tasks_repo.create_task(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        task_type="storyboard.generate",
        provider=ai_svc.PROVIDER,
        model=settings.anthropic_model,
        status="queued",
    )

    # 后台跑实际工作
    background_tasks.add_task(
        ai_svc.storyboard_generate_async,
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        style=body.style,
        shot_ids=body.shot_ids,
        regenerate_all=body.regenerate_all,
        with_images=body.with_images,
        task_id=str(task.id),
    )

    return {"task_id": str(task.id), "status": "queued"}


# ---- 3. POST /v1/ai/consistency/check ----

class ConsistencyCheckRequest(BaseModel):
    project_id: str
    content: str = Field(default="", description="如未传, 调用者应先 GET script 拿 content")


@router.post("/consistency/check")
async def consistency_check(
    body: ConsistencyCheckRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    if not body.content.strip():
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "content 不能为空 (m1: 由调用方读取后再传)"},
        )
    result = await ai_svc.consistency_check(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        content=body.content,
    )
    return result


# ---- 4. POST /v1/ai/consistency/fix ----

class ConsistencyFixRequest(BaseModel):
    project_id: str
    content: str
    character_name: str = Field(min_length=1)
    issue_index: int = Field(ge=0)


@router.post("/consistency/fix")
async def consistency_fix(
    body: ConsistencyFixRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    result = await ai_svc.consistency_fix(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        content=body.content,
        character_name=body.character_name,
        issue_index=body.issue_index,
    )
    return result


# ---- 5. POST /v1/ai/voice/match ----

class VoiceMatchRequest(BaseModel):
    project_id: str
    content: str
    auto_assign: bool = False


@router.post("/voice/match")
async def voice_match(
    body: VoiceMatchRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    result = await ai_svc.voice_match(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        content=body.content,
        auto_assign=body.auto_assign,
    )
    return result


# ---- 6. POST /v1/ai/edit/auto ----

class EditAutoParams(BaseModel):
    transition: str | None = None
    bgm_intensity: float | None = None
    subtitle_style: str | None = None
    pace_cut: str | None = None


class EditAutoRequest(BaseModel):
    project_id: str
    preset: str = "default"
    params: EditAutoParams = EditAutoParams()


@router.post("/edit/auto")
async def edit_auto(
    body: EditAutoRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    result = await ai_svc.edit_auto(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        preset=body.preset,
        params=body.params.model_dump(),
    )
    return result


# ---- 7. GET /v1/ai/tasks/:task_id ----

@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    auth: AuthContext = Depends(require_auth),
):
    task = await tasks_repo.get_task(
        team_id=auth.team_id, user_id=auth.user_id, task_id=task_id,
    )
    if task is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "TASK_NOT_FOUND", "message": "ai task 不存在"},
        )
    return task_to_dto(task)


# ---- bonus: GET /v1/ai/tasks (list) — 帮 dev 查最近任务 ----

@router.get("/tasks")
async def list_tasks(
    project_id: str | None = None,
    limit: int = 50,
    auth: AuthContext = Depends(require_auth),
):
    items = await tasks_repo.list_tasks(
        team_id=auth.team_id, user_id=auth.user_id,
        project_id=project_id, limit=limit,
    )
    return {"data": [task_to_dto(t) for t in items], "meta": {"count": len(items)}}


# ---- 8. POST /v1/ai/chat (对话 agent) ----

class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatContext(BaseModel):
    has_script: bool = False
    has_shots: bool = False
    has_voice: bool = False
    has_video: bool = False
    idea: dict[str, Any] = Field(default_factory=dict)
    conversation_memory: dict[str, Any] = Field(default_factory=dict)
    canvas_context_summary: dict[str, Any] = Field(default_factory=dict)
    focus_memory: dict[str, Any] = Field(default_factory=dict)
    turn_context: dict[str, Any] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    project_id: str | None = None
    stage: str = "idea"
    messages: list[ChatTurn] = Field(min_length=1)
    context: ChatContext = ChatContext()


@router.post("/chat")
async def chat(
    body: ChatRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    result = await ai_svc.chat_respond(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        stage=body.stage,
        messages=[t.model_dump() for t in body.messages],
        context=body.context.model_dump(),
    )
    return result


# ---- 8b. POST /v1/ai/intent/classify (后续阶段自由输入意图分类) ----

class IntentClassifyRequest(BaseModel):
    message: str = Field(min_length=1)
    stage: str
    step: str = ""
    context: str = ""


@router.post("/intent/classify")
async def intent_classify(
    body: IntentClassifyRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    result = await ai_svc.intent_classify(
        team_id=auth.team_id,
        user_id=auth.user_id,
        message=body.message,
        stage=body.stage,
        step=body.step,
        context=body.context,
    )
    return result


# ---- 8c. POST /v1/ai/title (对话/项目标题生成) ----

class TitleRequest(BaseModel):
    message: str = Field(min_length=1, description="用户的第一句话/灵感")
    project_id: str | None = None


@router.post("/title")
async def title(
    body: TitleRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    result = await ai_svc.generate_title(
        team_id=auth.team_id,
        user_id=auth.user_id,
        project_id=body.project_id,
        message=body.message,
    )
    return result


# ---- 9. POST /v1/ai/tts ----

class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4096)
    voice: str = Field(min_length=1)
    speed: float = Field(default=1.0, ge=0.25, le=4.0)


@router.post("/tts")
async def tts(
    body: TTSRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    audio_bytes = await ai_svc.tts_generate(
        text=body.text,
        voice=body.voice,
        speed=body.speed,
    )
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'inline; filename="tts.mp3"'},
    )


# ---- 10. 单节点优化(canvas-node-optimize-panel): 专门端点,不复用 /chat ----

class RewriteSceneRequest(BaseModel):
    project_id: str
    scene_index: int = Field(ge=0)
    instruction: str = Field(min_length=1)


@router.post("/script/rewrite-scene")
async def script_rewrite_scene(
    body: RewriteSceneRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    return await ai_svc.rewrite_scene(
        team_id=auth.team_id, user_id=auth.user_id,
        project_id=body.project_id, scene_index=body.scene_index, instruction=body.instruction,
    )


class ShotOptimizeRequest(BaseModel):
    project_id: str
    shot_id: str
    instruction: str = Field(min_length=1)
    ref_image_url: str | None = None
    mode: str = Field(default="text", pattern="^(text|image|both)$")


@router.post("/shot/optimize")
async def shot_optimize(
    body: ShotOptimizeRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    return await ai_svc.optimize_shot(
        team_id=auth.team_id, user_id=auth.user_id, project_id=body.project_id,
        shot_id=body.shot_id, instruction=body.instruction,
        ref_image_url=body.ref_image_url, mode=body.mode,
    )


class CharacterOptimizeRequest(BaseModel):
    project_id: str
    asset_id: str
    instruction: str = Field(min_length=1)
    # canvas-image-generation:true → 生成头像(覆盖 file_url);false → 改 description
    generate_avatar: bool = False


@router.post("/character/optimize")
async def character_optimize(
    body: CharacterOptimizeRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    return await ai_svc.optimize_character(
        team_id=auth.team_id, user_id=auth.user_id,
        project_id=body.project_id, asset_id=body.asset_id, instruction=body.instruction,
        generate_avatar=body.generate_avatar,
    )
