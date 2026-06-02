"""集成: storyboard 异步生成 → 持久化 shots 到 script-service 的 shots 表 + 失败标记."""
from __future__ import annotations
import json

import asyncpg
import pytest

from app.services import ai as ai_svc
from app.repo import tasks as tasks_repo

pytestmark = pytest.mark.asyncio(loop_scope="session")


SHOTS_JSON = json.dumps(
    [
        {"title": "镜头一", "shot_type": "wide", "duration_ms": 4000,
         "bg_style": "咖啡馆", "dialog": "你来了。", "description": "雨天，小艾靠窗。"},
        {"title": "镜头二", "shot_type": "close-up", "duration_ms": 3000,
         "bg_style": "地铁", "dialog": "快跑！", "description": "追逐戏，镜头摇晃。"},
    ],
    ensure_ascii=False,
)


async def _count_shots(harness, project_id: str) -> list[asyncpg.Record]:
    admin = await asyncpg.connect(dsn=harness.admin_dsn)
    try:
        return await admin.fetch(
            "SELECT title, shot_type, duration_ms, dialog, bg_style, metadata, order_index "
            "FROM shots WHERE project_id = $1 ORDER BY order_index",
            __import__("uuid").UUID(project_id),
        )
    finally:
        await admin.close()


async def test_storyboard_persists_shots(client, harness, clean_tables, monkeypatch):
    async def fake_once(prompt, system, max_tokens=2000):
        return SHOTS_JSON, 10, 20
    monkeypatch.setattr(ai_svc, "_anthropic_once", fake_once)

    t = harness.team_a
    task = await tasks_repo.create_task(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        task_type="storyboard.generate", provider=ai_svc.PROVIDER, model="test",
    )
    await ai_svc.storyboard_generate_async(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        style="日系动漫", shot_ids=None, regenerate_all=True, with_images=False, task_id=str(task.id),
    )

    done = await tasks_repo.get_task(team_id=t.team_id, user_id=t.owner_id, task_id=str(task.id))
    assert done.status == "succeeded"

    rows = await _count_shots(harness, t.project_id)
    assert len(rows) == 2
    assert rows[0]["title"] == "镜头一"
    assert rows[0]["order_index"] == 0
    assert rows[1]["order_index"] == 1
    assert rows[0]["bg_style"] == "咖啡馆"
    assert rows[0]["dialog"] == "你来了。"
    # description has no column → parked in metadata
    meta0 = rows[0]["metadata"]
    if isinstance(meta0, str):
        meta0 = json.loads(meta0)
    assert meta0.get("description") == "雨天，小艾靠窗。"
    assert meta0.get("style") == "日系动漫"


async def test_storyboard_regenerate_replaces(client, harness, clean_tables, monkeypatch):
    async def fake_once(prompt, system, max_tokens=2000):
        return SHOTS_JSON, 10, 20
    monkeypatch.setattr(ai_svc, "_anthropic_once", fake_once)

    t = harness.team_a
    for _ in range(2):
        task = await tasks_repo.create_task(
            team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
            task_type="storyboard.generate", provider=ai_svc.PROVIDER, model="test",
        )
        await ai_svc.storyboard_generate_async(
            team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
            style="日系动漫", shot_ids=None, regenerate_all=True, with_images=False, task_id=str(task.id),
        )
    rows = await _count_shots(harness, t.project_id)
    assert len(rows) == 2  # not 4 — regenerate cleared the previous batch


async def test_storyboard_failed_when_unparseable(client, harness, clean_tables, monkeypatch):
    async def fake_once(prompt, system, max_tokens=2000):
        return "抱歉，我无法生成分镜。", 5, 5
    monkeypatch.setattr(ai_svc, "_anthropic_once", fake_once)

    t = harness.team_a
    task = await tasks_repo.create_task(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        task_type="storyboard.generate", provider=ai_svc.PROVIDER, model="test",
    )
    await ai_svc.storyboard_generate_async(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        style="日系动漫", shot_ids=None, regenerate_all=True, with_images=False, task_id=str(task.id),
    )

    done = await tasks_repo.get_task(team_id=t.team_id, user_id=t.owner_id, task_id=str(task.id))
    assert done.status == "failed"
    rows = await _count_shots(harness, t.project_id)
    assert len(rows) == 0
