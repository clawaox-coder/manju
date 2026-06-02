from __future__ import annotations

import pytest

from app.repo import image_quota as image_quota_repo

pytestmark = pytest.mark.asyncio(loop_scope="session")


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_list_image_quota_owner_ok(client, harness, monkeypatch):
    async def fake_list_by_team(*, team_id, user_id):
        assert team_id == harness.team_a.team_id
        assert user_id == harness.team_a.owner_id
        return [{
            "month_yymm": "2026-06",
            "used": 12,
            "limit": 50,
            "updated_at": None,
        }]

    monkeypatch.setattr(image_quota_repo, "list_by_team", fake_list_by_team)

    r = await client.get(
        "/v1/admin/image-quota",
        headers=auth_headers(harness.team_a.owner_token),
    )

    assert r.status_code == 200
    assert r.json()["data"][0]["month_yymm"] == "2026-06"
    assert r.json()["data"][0]["used"] == 12


async def test_patch_image_quota_owner_ok(client, harness, monkeypatch):
    async def fake_get_month(*, team_id, user_id, month_yymm):
        assert month_yymm == "2026-06"
        return {
            "month_yymm": month_yymm,
            "used": 8,
            "limit": 50,
            "updated_at": None,
        }

    async def fake_update_limit(*, team_id, user_id, month_yymm, new_limit):
        return {
            "month_yymm": month_yymm,
            "used": 8,
            "limit": new_limit,
            "updated_at": None,
        }

    monkeypatch.setattr(image_quota_repo, "get_month", fake_get_month)
    monkeypatch.setattr(image_quota_repo, "update_limit", fake_update_limit)

    r = await client.patch(
        "/v1/admin/image-quota/2026-06",
        json={"limit": 80},
        headers=auth_headers(harness.team_a.owner_token),
    )

    assert r.status_code == 200
    assert r.json()["data"]["limit"] == 80


async def test_patch_image_quota_rejects_limit_below_used(client, harness, monkeypatch):
    async def fake_get_month(*, team_id, user_id, month_yymm):
        return {
            "month_yymm": month_yymm,
            "used": 9,
            "limit": 50,
            "updated_at": None,
        }

    update_called = {"value": False}

    async def fake_update_limit(*, team_id, user_id, month_yymm, new_limit):
        update_called["value"] = True
        return {
            "month_yymm": month_yymm,
            "used": 9,
            "limit": new_limit,
            "updated_at": None,
        }

    monkeypatch.setattr(image_quota_repo, "get_month", fake_get_month)
    monkeypatch.setattr(image_quota_repo, "update_limit", fake_update_limit)

    r = await client.patch(
        "/v1/admin/image-quota/2026-06",
        json={"limit": 8},
        headers=auth_headers(harness.team_a.owner_token),
    )

    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INVALID_LIMIT"
    assert not update_called["value"]


async def test_image_quota_viewer_forbidden(client, harness):
    r = await client.get(
        "/v1/admin/image-quota",
        headers=auth_headers(harness.team_a.viewer_token),
    )
    assert r.status_code == 403
