from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..auth import AuthContext, require_auth
from ..services.ai import stream_script_continue

router = APIRouter()


class ScriptContinueRequest(BaseModel):
    project_id: str
    context: str
    instruction: str


@router.post("/script/continue")
async def script_continue(
    body: ScriptContinueRequest,
    auth: AuthContext = Depends(require_auth),
):
    async def event_generator():
        async for event in stream_script_continue(body.context, body.instruction):
            yield event

    return EventSourceResponse(event_generator())
