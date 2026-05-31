"""P1.5: chat agent 全管线契约测试 (stub 掉真 LLM 调用).

验证 P1 的两处改动, 不依赖真实 anthropic key:
  - prompt 拼装透传 stage + 四个项目状态 flag (has_script/shots/voice/video)
  - CHAT_SYSTEM 编入按 stage 的 trigger 白名单
  - 每 stage 对应的 trigger 能原样穿过响应封套
"""

from __future__ import annotations
import json
import pytest

from app.services import ai as ai_svc

pytestmark = pytest.mark.asyncio(loop_scope="session")


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def stub_llm(monkeypatch):
    """把 _anthropic_once 换成捕获器: 记下 (prompt, system), 回可控 JSON."""
    captured: dict[str, str] = {}
    canned = {"thinking": "", "reply": "好的", "options": [], "extracted": {}, "trigger": None}

    async def fake_once(prompt: str, system: str, max_tokens: int = 2000):
        captured["prompt"] = prompt
        captured["system"] = system
        return json.dumps(canned), 10, 5

    monkeypatch.setattr(ai_svc, "_anthropic_once", fake_once)
    return captured, canned


# ---- prompt 拼装: stage + 四个 flag 都透传 ----

async def test_prompt_carries_stage_and_all_flags(client, harness, clean_tables, stub_llm):
    captured, _ = stub_llm
    r = await client.post(
        "/v1/ai/chat",
        json={
            "project_id": harness.team_a.project_id,
            "stage": "voice",
            "messages": [{"role": "user", "content": "开始配音吧"}],
            "context": {"has_script": True, "has_shots": True, "has_voice": False, "has_video": False},
        },
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 200, r.text
    prompt = captured["prompt"]
    assert "当前阶段: voice" in prompt
    # 四个 flag 全部出现在 prompt 里 (P1.3)
    assert "已有剧本=True" in prompt
    assert "已有分镜=True" in prompt
    assert "已配音=False" in prompt
    assert "已出片=False" in prompt


# ---- CHAT_SYSTEM: 按 stage 的 trigger 白名单 (P1.2) ----

async def test_system_prompt_encodes_per_stage_trigger_whitelist(stub_llm):
    sysp = ai_svc.CHAT_SYSTEM
    # 不再写死「只负责 idea」
    assert "你负责 idea 阶段" not in sysp
    # 五个阶段 → 各自唯一允许的 action 都在系统提示里
    for stage_action in [
        ("idea", "generate_script"),
        ("script", "generate_storyboard"),
        ("storyboard", "match_voice"),
        ("voice", "render_video"),
    ]:
        assert stage_action[1] in sysp, stage_action
    # video 阶段明确不允许 trigger
    assert "video" in sysp


# ---- trigger 原样穿过响应封套 ----

async def test_trigger_passthrough(client, harness, clean_tables, monkeypatch):
    import json as _json

    async def fake_once(prompt, system, max_tokens=2000):
        return _json.dumps({
            "thinking": "", "reply": "这就生成分镜", "options": [], "extracted": {},
            "trigger": {"action": "generate_storyboard", "params": {}},
        }), 10, 5

    monkeypatch.setattr(ai_svc, "_anthropic_once", fake_once)
    r = await client.post(
        "/v1/ai/chat",
        json={
            "project_id": harness.team_a.project_id,
            "stage": "script",
            "messages": [{"role": "user", "content": "这个方向不错，下一步"}],
            "context": {"has_script": True},
        },
        headers=auth_headers(harness.team_a.owner_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["trigger"] == {"action": "generate_storyboard", "params": {}}


# ---- 无 token 仍 401 (回归) ----

async def test_chat_requires_auth(client):
    r = await client.post(
        "/v1/ai/chat",
        json={"stage": "idea", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 401
