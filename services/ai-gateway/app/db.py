"""asyncpg 池 + RLS context helper.

要点 (与 go 服务对齐):
- 每个请求 acquire 一个 connection
- BEGIN; SELECT set_config('app.team_id', ...) + ('app.user_id', ...)
- 在该 connection 上跑业务 SQL
- COMMIT 或 ROLLBACK 释放

asyncpg 与 pgx 转换:
- DATABASE_URL 用 "postgres://" 走得通
- asyncpg 不认 query string 里的 "sslmode=disable", 启动时滤掉
"""

from __future__ import annotations
import logging
import re
from contextlib import asynccontextmanager
from typing import AsyncIterator
from urllib.parse import urlparse

import asyncpg

logger = logging.getLogger("ai-gateway.db")

_pool: asyncpg.Pool | None = None


def _normalize_dsn(url: str) -> str:
    """asyncpg 不支持 sslmode 等 libpq query params, 滤掉."""
    # 简单粗暴: 直接拆 query 去掉 sslmode
    parsed = urlparse(url)
    if not parsed.query:
        return url
    pairs = []
    for pair in parsed.query.split("&"):
        if "=" not in pair:
            pairs.append(pair)
            continue
        k, _ = pair.split("=", 1)
        if k.lower() == "sslmode":
            continue
        pairs.append(pair)
    new_query = "&".join(pairs)
    return parsed._replace(query=new_query).geturl()


async def init_pool(database_url: str) -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool
    dsn = _normalize_dsn(database_url)
    _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("db pool 未初始化 — main.py lifespan 漏调 init_pool")
    return _pool


@asynccontextmanager
async def team_ctx(team_id: str, user_id: str) -> AsyncIterator[asyncpg.Connection]:
    """事务 + SET LOCAL app.team_id/user_id 让 RLS 真正生效."""
    pool = get_pool()
    async with pool.acquire() as conn:
        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute("SELECT set_config('app.team_id', $1, true)", str(team_id))
            await conn.execute("SELECT set_config('app.user_id', $1, true)", str(user_id))
            yield conn
            await tx.commit()
        except Exception:
            await tx.rollback()
            raise


async def apply_migrations(pool: asyncpg.Pool, migrations_dir: str) -> None:
    """启动时把 migrations/*.sql 顺序 apply. 假定 SQL 自带 IF NOT EXISTS / 幂等."""
    import os
    files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    for f in files:
        path = os.path.join(migrations_dir, f)
        with open(path) as fp:
            sql = fp.read()
        async with pool.acquire() as conn:
            try:
                await conn.execute(sql)
                logger.info(f"applied migration {f}")
            except asyncpg.exceptions.DuplicateTableError:
                logger.info(f"migration {f} already applied (table exists)")
            except asyncpg.exceptions.DuplicateObjectError:
                logger.info(f"migration {f} already applied (object exists)")
