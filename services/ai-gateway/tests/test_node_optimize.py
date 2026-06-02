"""P1.5: 单节点优化端点的业务逻辑单测(service 层)。

monkeypatch 掉 repo 与 _run_and_record,不依赖 DB / LLM / auth,验证各分支:
  - shot/optimize: image|both → 501;非法 mode → 400;404;text happy
  - rewrite-scene: 无剧本 → 404;scene_index 越界 → 400;版本冲突 → 409;happy 仅改目标场
  - character/optimize: 资产不存在 → 404;非角色 → 400;happy
(真 DB 下的 RLS / 乐观版本由 tests/integration 的 harness 覆盖。)
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.repo import assets as assets_repo
from app.repo import scripts as scripts_repo
from app.repo import shots as shots_repo
from app.services import ai as ai_svc

pytestmark = pytest.mark.asyncio(loop_scope="session")

TEAM = "00000000-0000-0000-0000-000000000001"
USER = "00000000-0000-0000-0000-000000000002"


def _stub_llm(monkeypatch, text: str = "新内容"):
    async def fake(**kwargs):
        return {"text": text}, None

    monkeypatch.setattr(ai_svc, "_run_and_record", fake)


# ---- shot/optimize ----

async def test_shot_image_mode_501(monkeypatch):
    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_shot(
            team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
            instruction="x", ref_image_url=None, mode="image",
        )
    assert e.value.status_code == 501


async def test_shot_bad_mode_400(monkeypatch):
    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_shot(
            team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
            instruction="x", ref_image_url=None, mode="bogus",
        )
    assert e.value.status_code == 400


async def test_shot_not_found_404(monkeypatch):
    async def no_shot(**kw):
        return None

    monkeypatch.setattr(shots_repo, "get_shot", no_shot)
    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_shot(
            team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
            instruction="x", ref_image_url=None, mode="text",
        )
    assert e.value.status_code == 404


async def test_shot_text_happy(monkeypatch):
    saved: dict = {}

    async def get_shot(**kw):
        return {"title": "镜1", "dialog": "旧对白", "image_url": None}

    async def upd(**kw):
        saved.update(kw)
        return kw["dialog"]

    monkeypatch.setattr(shots_repo, "get_shot", get_shot)
    monkeypatch.setattr(shots_repo, "update_shot_dialog", upd)
    _stub_llm(monkeypatch, "新对白")
    out = await ai_svc.optimize_shot(
        team_id=TEAM, user_id=USER, project_id="p", shot_id="s",
        instruction="短一点", ref_image_url=None, mode="text",
    )
    assert out["dialog"] == "新对白"
    assert saved["dialog"] == "新对白"


# ---- rewrite-scene ----

async def test_rewrite_no_script_404(monkeypatch):
    async def none(**kw):
        return None

    monkeypatch.setattr(scripts_repo, "get_script", none)
    with pytest.raises(HTTPException) as e:
        await ai_svc.rewrite_scene(team_id=TEAM, user_id=USER, project_id="p", scene_index=0, instruction="x")
    assert e.value.status_code == 404


async def test_rewrite_index_oob_400(monkeypatch):
    async def scr(**kw):
        return {"content": "# A\naaa", "version_no": 1}

    monkeypatch.setattr(scripts_repo, "get_script", scr)
    with pytest.raises(HTTPException) as e:
        await ai_svc.rewrite_scene(team_id=TEAM, user_id=USER, project_id="p", scene_index=9, instruction="x")
    assert e.value.status_code == 400


async def test_rewrite_version_conflict_409(monkeypatch):
    async def scr(**kw):
        return {"content": "# A\naaa\n# B\nbbb", "version_no": 3}

    async def upd(**kw):
        return None  # 版本冲突

    monkeypatch.setattr(scripts_repo, "get_script", scr)
    monkeypatch.setattr(scripts_repo, "update_script_content", upd)
    _stub_llm(monkeypatch, "改后")
    with pytest.raises(HTTPException) as e:
        await ai_svc.rewrite_scene(team_id=TEAM, user_id=USER, project_id="p", scene_index=0, instruction="x")
    assert e.value.status_code == 409


async def test_rewrite_happy_only_target_changes(monkeypatch):
    captured: dict = {}

    async def scr(**kw):
        return {"content": "# A\naaa\n# B\nbbb", "version_no": 3}

    async def upd(*, team_id, user_id, project_id, content, expected_version_no):
        captured["content"] = content
        captured["expected"] = expected_version_no
        return expected_version_no + 1

    monkeypatch.setattr(scripts_repo, "get_script", scr)
    monkeypatch.setattr(scripts_repo, "update_script_content", upd)
    _stub_llm(monkeypatch, "新的 A 正文")
    out = await ai_svc.rewrite_scene(team_id=TEAM, user_id=USER, project_id="p", scene_index=0, instruction="x")
    # 只改第 0 场正文,B 原样,标题保留
    assert captured["content"] == "# A\n新的 A 正文\n# B\nbbb"
    assert captured["expected"] == 3
    assert out["version_no"] == 4


# ---- character/optimize ----

async def test_character_not_found_404(monkeypatch):
    async def none(**kw):
        return None

    monkeypatch.setattr(assets_repo, "get_character_asset", none)
    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_character(team_id=TEAM, user_id=USER, project_id="p", asset_id="a", instruction="x")
    assert e.value.status_code == 404


async def test_character_wrong_type_400(monkeypatch):
    async def a(**kw):
        return {"id": "a", "type": "scene", "name": "x", "description": ""}

    monkeypatch.setattr(assets_repo, "get_character_asset", a)
    with pytest.raises(HTTPException) as e:
        await ai_svc.optimize_character(team_id=TEAM, user_id=USER, project_id="p", asset_id="a", instruction="x")
    assert e.value.status_code == 400


async def test_character_happy(monkeypatch):
    async def a(**kw):
        return {"id": "a", "type": "character", "name": "小明", "description": "旧设定"}

    async def upd(**kw):
        return True

    monkeypatch.setattr(assets_repo, "get_character_asset", a)
    monkeypatch.setattr(assets_repo, "update_asset_description", upd)
    _stub_llm(monkeypatch, "新设定")
    out = await ai_svc.optimize_character(team_id=TEAM, user_id=USER, project_id="p", asset_id="a", instruction="更冷酷")
    assert out["description"] == "新设定"
