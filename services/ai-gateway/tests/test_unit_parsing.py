"""单元: prompt 构造 + JSON 解析容错 (无 DB, 不依赖 anthropic key)."""
from __future__ import annotations
import json

import pytest

from app.services import ai as ai_svc


class TestParseJSONLoose:
    def test_pure_object(self):
        assert ai_svc._parse_json_loose('{"a": 1}') == {"a": 1}

    def test_pure_array(self):
        assert ai_svc._parse_json_loose('[1, 2, 3]') == [1, 2, 3]

    def test_wrapped_in_codefence(self):
        text = '```json\n{"hello": "world"}\n```'
        assert ai_svc._parse_json_loose(text) == {"hello": "world"}

    def test_with_prose_prefix(self):
        text = '好的, 我会输出:\n\n{"items": []}\n\n以上.'
        assert ai_svc._parse_json_loose(text) == {"items": []}

    def test_array_with_prose(self):
        text = '回答如下:\n[{"id": 1}]'
        assert ai_svc._parse_json_loose(text) == [{"id": 1}]

    def test_chinese_content(self):
        text = '{"name": "林小七", "tags": ["主角"]}'
        assert ai_svc._parse_json_loose(text) == {"name": "林小七", "tags": ["主角"]}

    def test_unparseable(self):
        with pytest.raises(json.JSONDecodeError):
            ai_svc._parse_json_loose("this is not json")


class TestClientGuard:
    def test_raises_503_when_no_key(self, monkeypatch):
        """无真实 ANTHROPIC_API_KEY 或 AUTH_TOKEN 时, _client() 应 raise HTTPException 503."""
        from app.config import get_settings
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-placeholder")
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
        get_settings.cache_clear()

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            ai_svc._client()
        assert exc.value.status_code == 503
        assert "AI_PROVIDER_UNAVAILABLE" in str(exc.value.detail)
        get_settings.cache_clear()  # cleanup
