"""shots repo. ai-gateway 生成分镜后直接写 script-service 的 shots 表
(共享 postgres, 经 team_ctx 让 RLS 生效 — 与 ai_tasks 同一套写法).

注: shots 表归 script-service 所有, 但 ai-gateway 无法签发服务间 JWT
(只持有 JWT 公钥), 且无 script-service HTTP 客户端, 故走共享库直写。"""

from __future__ import annotations
import json
import uuid as uuidlib
from typing import Any

from ..db import team_ctx


def _as_int(v: Any, default: int) -> int:
    try:
        n = int(v)
        return n if n > 0 else default
    except (TypeError, ValueError):
        return default


def _as_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


async def replace_project_shots(
    *,
    team_id: str,
    user_id: str,
    project_id: str,
    shots: list[dict],
    style: str,
) -> int:
    """清空该项目现有 shots, 按顺序写入新批次. 返回写入条数.

    字段映射: title/shot_type/duration_ms/dialog/bg_style → 列;
    description 无对应列, 连同 style 落入 metadata jsonb。
    """
    pid = uuidlib.UUID(project_id)
    async with team_ctx(team_id, user_id) as conn:
        await conn.execute("DELETE FROM shots WHERE project_id = $1", pid)
        for idx, shot in enumerate(shots):
            if not isinstance(shot, dict):
                continue
            meta = {"style": style}
            desc = _as_str(shot.get("description"))
            if desc:
                meta["description"] = desc
            await conn.execute(
                """INSERT INTO shots
                     (project_id, order_index, title, shot_type, duration_ms, dialog, bg_style, metadata)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)""",
                pid,
                idx,
                _as_str(shot.get("title")),
                _as_str(shot.get("shot_type")),
                _as_int(shot.get("duration_ms"), 5000),
                _as_str(shot.get("dialog")),
                _as_str(shot.get("bg_style")),
                json.dumps(meta, ensure_ascii=False),
            )
    return sum(1 for s in shots if isinstance(s, dict))
