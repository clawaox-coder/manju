from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from app.repo import shots as shots_repo
from app.repo import tasks as tasks_repo
from app.services import ai as ai_svc

pytestmark = pytest.mark.asyncio(loop_scope="session")

SHOTS_JSON = json.dumps(
    [
        {"title": "镜头一", "shot_type": "wide", "duration_ms": 4000, "bg_style": "咖啡馆", "dialog": "你来了。", "description": "雨天，小艾靠窗。"},
        {"title": "镜头二", "shot_type": "close-up", "duration_ms": 3000, "bg_style": "地铁", "dialog": "快跑！", "description": "追逐戏，镜头摇晃。"},
        {"title": "镜头三", "shot_type": "medium", "duration_ms": 3000, "bg_style": "街道", "dialog": "等我。", "description": "人物回头。"},
    ],
    ensure_ascii=False,
)


async def _install_storyboard_text(monkeypatch):
    async def fake_once(prompt, system, max_tokens=2000):
        return SHOTS_JSON, 10, 20

    monkeypatch.setattr(ai_svc, "_anthropic_once", fake_once)


async def test_storyboard_with_images_updates_each_shot(client, monkeypatch, harness, clean_tables):
    await _install_storyboard_text(monkeypatch)

    calls: list[tuple[str, str]] = []

    async def fake_generate_and_save_image(**kwargs):
        return f"https://cdn.test/{kwargs['filename']}"

    async def fake_update_shot_image(*, team_id, user_id, shot_id, image_url):
        calls.append((shot_id, image_url))
        return image_url

    monkeypatch.setattr(ai_svc, "_generate_and_save_image", fake_generate_and_save_image)
    monkeypatch.setattr(shots_repo, "update_shot_image", fake_update_shot_image)

    t = harness.team_a
    task = await tasks_repo.create_task(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        task_type="storyboard.generate", provider=ai_svc.PROVIDER, model="test",
    )
    await ai_svc.storyboard_generate_async(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        style="日系动漫", shot_ids=None, regenerate_all=True, with_images=True, task_id=str(task.id),
    )

    done = await tasks_repo.get_task(team_id=t.team_id, user_id=t.owner_id, task_id=str(task.id))
    assert done.status == "succeeded"
    assert done.result_data["images_generated"] == 3
    assert done.result_data["images_failed"] == 0
    assert len(calls) == 3


async def test_storyboard_with_images_quota_exceeded_stops_remaining(client, monkeypatch, harness, clean_tables):
    await _install_storyboard_text(monkeypatch)

    count = {"value": 0}

    async def fake_generate_and_save_image(**kwargs):
        count["value"] += 1
        if count["value"] == 3:
            raise HTTPException(status_code=429, detail={"code": "IMAGE_QUOTA_EXCEEDED", "message": "quota"})
        return f"https://cdn.test/{kwargs['filename']}"

    monkeypatch.setattr(ai_svc, "_generate_and_save_image", fake_generate_and_save_image)

    t = harness.team_a
    task = await tasks_repo.create_task(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        task_type="storyboard.generate", provider=ai_svc.PROVIDER, model="test",
    )
    await ai_svc.storyboard_generate_async(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        style="日系动漫", shot_ids=None, regenerate_all=True, with_images=True, task_id=str(task.id),
    )

    done = await tasks_repo.get_task(team_id=t.team_id, user_id=t.owner_id, task_id=str(task.id))
    assert done.status == "succeeded"
    assert done.result_data["images_generated"] == 2
    assert done.result_data["images_failed"] == 0


async def test_storyboard_with_images_single_shot_502_continues(client, monkeypatch, harness, clean_tables):
    await _install_storyboard_text(monkeypatch)

    count = {"value": 0}

    async def fake_generate_and_save_image(**kwargs):
        count["value"] += 1
        if count["value"] == 2:
            raise HTTPException(status_code=502, detail={"code": "OPENAI_IMAGE_ERROR", "message": "upstream"})
        return f"https://cdn.test/{kwargs['filename']}"

    monkeypatch.setattr(ai_svc, "_generate_and_save_image", fake_generate_and_save_image)

    t = harness.team_a
    task = await tasks_repo.create_task(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        task_type="storyboard.generate", provider=ai_svc.PROVIDER, model="test",
    )
    await ai_svc.storyboard_generate_async(
        team_id=t.team_id, user_id=t.owner_id, project_id=t.project_id,
        style="日系动漫", shot_ids=None, regenerate_all=True, with_images=True, task_id=str(task.id),
    )

    done = await tasks_repo.get_task(team_id=t.team_id, user_id=t.owner_id, task_id=str(task.id))
    assert done.status == "succeeded"
    assert done.result_data["images_generated"] == 2
    assert done.result_data["images_failed"] == 1


async def test_storyboard_with_images_false_skips_image_generation(client, monkeypatch, harness, clean_tables):
    await _install_storyboard_text(monkeypatch)

    called = {"value": False}

    async def fake_generate_and_save_image(**kwargs):
        called["value"] = True
        return "https://cdn.test/nope.png"

    monkeypatch.setattr(ai_svc, "_generate_and_save_image", fake_generate_and_save_image)

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
    assert done.result_data["images_generated"] == 0
    assert done.result_data["images_failed"] == 0
    assert not called["value"]
