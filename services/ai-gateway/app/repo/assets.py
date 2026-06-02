"""assets repo —— ai-gateway 直写共享库(角色单元素优化)。

assets 表归 asset-service,经 team_ctx 直读写,RLS 兜底(与 repo/shots.py 同理)。
仅用于角色描述/设定的单元素优化;头像图重生成需图像模型,二期。
"""

from __future__ import annotations

import uuid as uuidlib

from ..db import team_ctx


async def get_character_asset(*, team_id: str, user_id: str, asset_id: str) -> dict | None:
    aid = uuidlib.UUID(asset_id)
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            """SELECT id, type::text AS type, name, description
                 FROM assets
                WHERE id = $1 AND deleted_at IS NULL""",
            aid,
        )
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "type": row["type"],
        "name": row["name"],
        "description": row["description"],
    }


async def update_asset_description(
    *, team_id: str, user_id: str, asset_id: str, description: str
) -> bool:
    aid = uuidlib.UUID(asset_id)
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            """UPDATE assets SET description = $1, updated_at = now()
                WHERE id = $2 AND deleted_at IS NULL
              RETURNING id""",
            description,
            aid,
        )
    return row is not None
