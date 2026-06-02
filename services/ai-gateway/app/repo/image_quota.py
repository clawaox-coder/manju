"""ai_image_quota repo —— 平台付费图像生成的月度配额(canvas-image-generation Decision 3)。

约定:
  - check_and_reserve:生成前调,验配额。**不**写 used(失败的生成不应计数)。
    若不存在该月行 → INSERT (used=0, limit=50);若 used >= limit → 抛 QuotaExceeded。
  - consume:生成 + 上传 + 写回都成功后调,used = used + 1。
  - FOR UPDATE 锁行防并发同 team 超用(代价:同 team 同月生成串行;接受,每张 5-15s)。
"""

from __future__ import annotations

import uuid as uuidlib
from datetime import datetime, timezone

from ..db import team_ctx


class QuotaExceeded(Exception):
    """配额已耗尽。services 层捕获后转 429。"""

    def __init__(self, used: int, limit: int):
        super().__init__(f"image quota exceeded: {used}/{limit}")
        self.used = used
        self.limit = limit


def current_month_yymm() -> str:
    """返回当前 UTC 月份字符串 'YYYY-MM'(与表 month_yymm 列对齐)。"""
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def check_and_reserve(*, team_id: str, user_id: str, month_yymm: str) -> tuple[int, int]:
    """生成前检查:行锁(FOR UPDATE)+ 按需 INSERT + 验 used < limit。

    返回 (used, limit) 当前值。超额抛 QuotaExceeded。**不**修改 used。
    """
    tid = uuidlib.UUID(team_id)
    async with team_ctx(team_id, user_id) as conn:
        # 按需 INSERT(冲突即忽略,后续 SELECT 拿现行值)
        await conn.execute(
            """INSERT INTO ai_image_quota (team_id, month_yymm, used, "limit")
                 VALUES ($1, $2, 0, 50)
               ON CONFLICT (team_id, month_yymm) DO NOTHING""",
            tid,
            month_yymm,
        )
        row = await conn.fetchrow(
            """SELECT used, "limit" FROM ai_image_quota
                WHERE team_id = $1 AND month_yymm = $2
                FOR UPDATE""",
            tid,
            month_yymm,
        )
        used, limit = int(row["used"]), int(row["limit"])
        if used >= limit:
            raise QuotaExceeded(used, limit)
    return used, limit


async def consume(*, team_id: str, user_id: str, month_yymm: str) -> int:
    """生成 + 上传 + 写回都成功后调:used = used + 1。返回新 used 值。"""
    tid = uuidlib.UUID(team_id)
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            """UPDATE ai_image_quota
                  SET used = used + 1, updated_at = now()
                WHERE team_id = $1 AND month_yymm = $2
              RETURNING used""",
            tid,
            month_yymm,
        )
    return int(row["used"]) if row else 0
