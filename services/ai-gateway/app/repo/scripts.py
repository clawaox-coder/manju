"""scripts repo —— ai-gateway 直写共享库(与 shots 同套 team_ctx 写法)。

scripts 表归 script-service,但 ai-gateway 无 S2S HTTP 客户端,故经 team_ctx 直读写,
RLS 兜底(与 repo/shots.py 同样的理由)。单场重写用乐观版本:
UPDATE ... WHERE project_id=$ AND version_no=$expected,版本不符即冲突。
"""

from __future__ import annotations

import uuid as uuidlib

from ..db import team_ctx
from ..scene_split import split_scenes


async def get_script(*, team_id: str, user_id: str, project_id: str) -> dict | None:
    pid = uuidlib.UUID(project_id)
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            "SELECT content, version_no FROM scripts WHERE project_id = $1", pid
        )
    if row is None:
        return None
    return {"content": row["content"], "version_no": row["version_no"]}


async def update_script_content(
    *, team_id: str, user_id: str, project_id: str, content: str, expected_version_no: int
) -> int | None:
    """乐观版本写回。返回新 version_no;版本不匹配(冲突)返回 None。

    word_count/scene_count 是派生展示字段,这里随内容一并重算(scene_count 用同一切分契约)。
    """
    pid = uuidlib.UUID(project_id)
    scene_count = len(split_scenes(content))
    word_count = len(content)
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            """UPDATE scripts
                  SET content = $1,
                      version_no = version_no + 1,
                      word_count = $2,
                      scene_count = $3,
                      updated_by = $4,
                      updated_at = now()
                WHERE project_id = $5 AND version_no = $6
              RETURNING version_no""",
            content,
            word_count,
            scene_count,
            uuidlib.UUID(user_id),
            pid,
            expected_version_no,
        )
    return row["version_no"] if row else None
