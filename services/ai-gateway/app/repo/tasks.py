"""ai_tasks repo. 所有读写都通过 db.team_ctx 让 RLS 生效."""

from __future__ import annotations
import json
import uuid as uuidlib
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg

from ..db import team_ctx


@dataclass
class AITask:
    id: uuidlib.UUID
    team_id: uuidlib.UUID
    user_id: uuidlib.UUID
    project_id: uuidlib.UUID | None
    task_type: str
    provider: str
    model: str | None
    status: str
    prompt_hash: str | None
    input_tokens: int | None
    output_tokens: int | None
    cost_credits: int | None
    duration_ms: int | None
    result_url: str | None
    result_data: dict | None
    error: str | None
    cached: bool
    created_at: datetime
    done_at: datetime | None


def _row_to_task(row: asyncpg.Record) -> AITask:
    result_data = row["result_data"]
    if isinstance(result_data, str):
        result_data = json.loads(result_data)
    return AITask(
        id=row["id"],
        team_id=row["team_id"],
        user_id=row["user_id"],
        project_id=row["project_id"],
        task_type=row["task_type"],
        provider=row["provider"],
        model=row["model"],
        status=row["status"],
        prompt_hash=row["prompt_hash"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        cost_credits=row["cost_credits"],
        duration_ms=row["duration_ms"],
        result_url=row["result_url"],
        result_data=result_data,
        error=row["error"],
        cached=row["cached"],
        created_at=row["created_at"],
        done_at=row["done_at"],
    )


TASK_COLUMNS = """id, team_id, user_id, project_id, task_type, provider, model, status,
    prompt_hash, input_tokens, output_tokens, cost_credits, duration_ms,
    result_url, result_data, error, cached, created_at, done_at"""


async def create_task(
    *,
    team_id: str,
    user_id: str,
    project_id: str | None,
    task_type: str,
    provider: str,
    model: str | None,
    status: str = "queued",
    prompt_hash: str | None = None,
) -> AITask:
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            f"""INSERT INTO ai_tasks (team_id, user_id, project_id, task_type, provider, model, status, prompt_hash)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING {TASK_COLUMNS}""",
            uuidlib.UUID(team_id),
            uuidlib.UUID(user_id),
            uuidlib.UUID(project_id) if project_id else None,
            task_type,
            provider,
            model,
            status,
            prompt_hash,
        )
        return _row_to_task(row)


async def get_task(*, team_id: str, user_id: str, task_id: str) -> AITask | None:
    try:
        task_uuid = uuidlib.UUID(task_id)
    except ValueError:
        return None
    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            f"SELECT {TASK_COLUMNS} FROM ai_tasks WHERE id = $1",
            task_uuid,
        )
        return _row_to_task(row) if row else None


async def update_task_status(
    *,
    team_id: str,
    user_id: str,
    task_id: uuidlib.UUID,
    status: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    duration_ms: int | None = None,
    result_data: dict | None = None,
    result_url: str | None = None,
    error: str | None = None,
    cached: bool | None = None,
    done: bool = False,
) -> AITask | None:
    """部分更新 — 仅给非 None 字段. done=True 时同时打 done_at."""
    sets: list[str] = ["status = $1"]
    args: list[Any] = [status]
    idx = 2

    def add(col: str, val: Any) -> None:
        nonlocal idx
        sets.append(f"{col} = ${idx}")
        args.append(val)
        idx += 1

    if input_tokens is not None:
        add("input_tokens", input_tokens)
    if output_tokens is not None:
        add("output_tokens", output_tokens)
    if duration_ms is not None:
        add("duration_ms", duration_ms)
    if result_data is not None:
        add("result_data", json.dumps(result_data))
    if result_url is not None:
        add("result_url", result_url)
    if error is not None:
        add("error", error)
    if cached is not None:
        add("cached", cached)
    if done:
        sets.append("done_at = now()")

    args.append(task_id)
    where_idx = idx

    async with team_ctx(team_id, user_id) as conn:
        row = await conn.fetchrow(
            f"""UPDATE ai_tasks SET {', '.join(sets)}
                WHERE id = ${where_idx}
                RETURNING {TASK_COLUMNS}""",
            *args,
        )
        return _row_to_task(row) if row else None


async def list_tasks(
    *,
    team_id: str,
    user_id: str,
    project_id: str | None = None,
    limit: int = 50,
) -> list[AITask]:
    if limit < 1 or limit > 200:
        limit = 50
    async with team_ctx(team_id, user_id) as conn:
        if project_id:
            rows = await conn.fetch(
                f"""SELECT {TASK_COLUMNS} FROM ai_tasks
                    WHERE project_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2""",
                uuidlib.UUID(project_id),
                limit,
            )
        else:
            rows = await conn.fetch(
                f"""SELECT {TASK_COLUMNS} FROM ai_tasks
                    ORDER BY created_at DESC
                    LIMIT $1""",
                limit,
            )
        return [_row_to_task(r) for r in rows]
