"""集成测试: ai_tasks 持久化 + RLS + auth (跳过真实 anthropic 调用)."""

from __future__ import annotations
import pytest


pytestmark = pytest.mark.asyncio(loop_scope="session")


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---- auth + permission ----

async def test_no_token_returns_401(client):
    r = await client.get("/v1/ai/tasks/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 401


async def test_garbage_token_returns_401(client):
    r = await client.get(
        "/v1/ai/tasks/00000000-0000-0000-0000-000000000000",
        headers={"Authorization": "Bearer garbage"},
    )
    assert r.status_code == 401


async def test_viewer_cannot_write(client, harness, clean_tables):
    for path, body in [
        ("/v1/ai/consistency/check", {"project_id": harness.team_a.project_id, "content": "x"}),
        ("/v1/ai/consistency/fix", {"project_id": harness.team_a.project_id, "content": "x", "character_name": "y", "issue_index": 0}),
        ("/v1/ai/voice/match", {"project_id": harness.team_a.project_id, "content": "x"}),
        ("/v1/ai/edit/auto", {"project_id": harness.team_a.project_id}),
        ("/v1/ai/storyboard/generate", {"project_id": harness.team_a.project_id}),
    ]:
        r = await client.post(path, json=body, headers=auth_headers(harness.team_a.viewer_token))
        assert r.status_code == 403, f"{path}: {r.status_code} {r.text}"


# ---- AI provider 503 ----

async def test_consistency_check_503(client, harness, clean_tables):
    r = await client.post(
        "/v1/ai/consistency/check",
        json={"project_id": harness.team_a.project_id, "content": "测试内容"},
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 503, r.text
    body = r.json()
    detail = body.get("detail", {})
    assert detail.get("code") == "AI_PROVIDER_UNAVAILABLE"


async def test_voice_match_503(client, harness, clean_tables):
    r = await client.post(
        "/v1/ai/voice/match",
        json={"project_id": harness.team_a.project_id, "content": "x", "auto_assign": False},
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 503


async def test_edit_auto_503(client, harness, clean_tables):
    r = await client.post(
        "/v1/ai/edit/auto",
        json={"project_id": harness.team_a.project_id, "preset": "fast"},
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 503


# ---- consistency check validation ----

async def test_consistency_check_empty_content(client, harness):
    r = await client.post(
        "/v1/ai/consistency/check",
        json={"project_id": harness.team_a.project_id, "content": ""},
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "INVALID_INPUT"


# ---- storyboard async ----

async def test_storyboard_async_creates_task_returns_id(client, harness, clean_tables):
    r = await client.post(
        "/v1/ai/storyboard/generate",
        json={"project_id": harness.team_a.project_id, "style": "anime"},
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "task_id" in body
    assert body["status"] == "queued"


# ---- GET tasks/{id} + RLS ----

async def test_get_task_404_random_id(client, harness, clean_tables):
    r = await client.get(
        "/v1/ai/tasks/00000000-0000-0000-0000-000000000999",
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TASK_NOT_FOUND"


async def test_get_task_404_invalid_uuid(client, harness, clean_tables):
    r = await client.get(
        "/v1/ai/tasks/not-a-uuid",
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 404


async def test_team_can_see_own_task(client, harness, clean_tables):
    r = await client.post(
        "/v1/ai/storyboard/generate",
        json={"project_id": harness.team_a.project_id},
        headers=auth_headers(harness.team_a.owner_token),
    )
    task_id = r.json()["task_id"]

    r = await client.get(
        f"/v1/ai/tasks/{task_id}",
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == task_id
    assert body["task_type"] == "storyboard.generate"
    assert body["team_id"] == harness.team_a.team_id


async def test_rls_cross_team_blocked(client, harness, clean_tables):
    r = await client.post(
        "/v1/ai/storyboard/generate",
        json={"project_id": harness.team_a.project_id},
        headers=auth_headers(harness.team_a.owner_token),
    )
    task_id = r.json()["task_id"]

    r = await client.get(
        f"/v1/ai/tasks/{task_id}",
        headers=auth_headers(harness.team_b.owner_token),
    )
    assert r.status_code == 404


# ---- list ----

async def test_list_empty(client, harness, clean_tables):
    r = await client.get(
        "/v1/ai/tasks",
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 200
    assert r.json()["data"] == []


async def test_list_returns_owns(client, harness, clean_tables):
    for _ in range(2):
        await client.post(
            "/v1/ai/storyboard/generate",
            json={"project_id": harness.team_a.project_id},
            headers=auth_headers(harness.team_a.owner_token),
        )
    r = await client.get(
        "/v1/ai/tasks",
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2


async def test_list_rls(client, harness, clean_tables):
    await client.post(
        "/v1/ai/storyboard/generate",
        json={"project_id": harness.team_a.project_id},
        headers=auth_headers(harness.team_a.owner_token),
    )
    r = await client.get(
        "/v1/ai/tasks",
        headers=auth_headers(harness.team_b.owner_token),
    )
    assert r.status_code == 200
    assert r.json()["data"] == []


# ---- healthz ----

async def test_healthz(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.text == "ok"
