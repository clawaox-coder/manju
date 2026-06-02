from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import AuthContext, require_auth
from ..repo import image_quota as image_quota_repo

router = APIRouter()


def _require_write(auth: AuthContext) -> None:
    if auth.role == "viewer":
        raise HTTPException(
            status_code=403,
            detail={"code": "INSUFFICIENT_PERMISSION", "message": "viewer 只读, 无写权限"},
        )


def _row_to_dto(row: dict) -> dict:
    return {
        "month_yymm": row["month_yymm"],
        "used": row["used"],
        "limit": row["limit"],
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


class UpdateImageQuotaRequest(BaseModel):
    limit: int = Field(ge=0)


@router.get("/image-quota")
async def list_image_quota(auth: AuthContext = Depends(require_auth)):
    _require_write(auth)
    rows = await image_quota_repo.list_by_team(team_id=auth.team_id, user_id=auth.user_id)
    return {"data": [_row_to_dto(row) for row in rows]}


@router.patch("/image-quota/{month_yymm}")
async def patch_image_quota(
    month_yymm: str,
    body: UpdateImageQuotaRequest,
    auth: AuthContext = Depends(require_auth),
):
    _require_write(auth)
    current = await image_quota_repo.get_month(
        team_id=auth.team_id,
        user_id=auth.user_id,
        month_yymm=month_yymm,
    )
    if current is not None and body.limit < current["used"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_LIMIT", "message": "新额度不能小于已用次数"},
        )
    row = await image_quota_repo.update_limit(
        team_id=auth.team_id,
        user_id=auth.user_id,
        month_yymm=month_yymm,
        new_limit=body.limit,
    )
    return {"data": _row_to_dto(row)}
