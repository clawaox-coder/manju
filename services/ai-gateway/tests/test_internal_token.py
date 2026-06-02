"""单元: S2S token 签发. 验证签出的 token 满足 asset-service verifier 的全部硬要求.

不依赖 DB / anthropic。用 dev 密钥对(scripts/dev/secrets)本地签+验,模拟 asset-service
verifier(只验 RS256 签名 + issuer)与 middleware(sub 必须合法 UUID, team_id/role 非空)。
"""
from __future__ import annotations
import time
import uuid
from pathlib import Path

import pytest
from jose import jwt

from app import internal_token, config

# dev 密钥对(与各服务共用)
_SECRETS = Path(__file__).resolve().parents[3] / "scripts" / "dev" / "secrets"
_PRIV = _SECRETS / "jwt-private.pem"
_PUB = _SECRETS / "jwt-public.pem"

pytestmark = pytest.mark.skipif(not _PRIV.exists(), reason="dev 私钥不存在,跳过 S2S 单测")


@pytest.fixture
def s2s_settings(monkeypatch):
    """把 settings 的私钥路径指到 dev secrets,并清掉 lru_cache。"""
    config.get_settings.cache_clear()
    internal_token._private_key.cache_clear()
    monkeypatch.setenv("JWT_PRIVATE_KEY_PATH", str(_PRIV))
    monkeypatch.setenv("JWT_ISSUER", "manju-auth")
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()
    internal_token._private_key.cache_clear()


def test_has_s2s_true_when_key_present(s2s_settings):
    assert internal_token.has_s2s() is True


def test_minted_token_verifies_and_has_required_claims(s2s_settings):
    team_id = str(uuid.uuid4())
    token = internal_token.mint_s2s_token(team_id)

    # 用公钥验签(模拟 asset-service verifier:RS256 + issuer)
    pub = _PUB.read_text()
    claims = jwt.decode(token, pub, algorithms=["RS256"], issuer="manju-auth")

    # middleware 硬要求:sub 是合法 UUID、team_id/role 非空
    assert claims["team_id"] == team_id
    assert claims["role"] == "owner"
    uuid.UUID(claims["sub"])  # 不抛即合法 UUID(否则 asset middleware 会 panic)
    assert claims["iss"] == "manju-auth"
    assert claims["jti"]


def test_token_is_short_lived(s2s_settings):
    token = internal_token.mint_s2s_token(str(uuid.uuid4()))
    pub = _PUB.read_text()
    claims = jwt.decode(token, pub, algorithms=["RS256"], issuer="manju-auth")
    ttl = claims["exp"] - claims["iat"]
    assert 0 < ttl <= 120  # 短期(实现为 60s)


def test_wrong_issuer_rejected(s2s_settings):
    """issuer 不符应被 verifier 拒(asset-service 校验 issuer)。"""
    token = internal_token.mint_s2s_token(str(uuid.uuid4()))
    pub = _PUB.read_text()
    with pytest.raises(Exception):
        jwt.decode(token, pub, algorithms=["RS256"], issuer="someone-else")


def test_no_private_key_means_no_s2s(monkeypatch):
    """未配私钥时 has_s2s False、mint 抛错(调用方应降级)。"""
    config.get_settings.cache_clear()
    internal_token._private_key.cache_clear()
    monkeypatch.setenv("JWT_PRIVATE_KEY_PATH", "")
    config.get_settings.cache_clear()
    try:
        assert internal_token.has_s2s() is False
        with pytest.raises(RuntimeError):
            internal_token.mint_s2s_token(str(uuid.uuid4()))
    finally:
        config.get_settings.cache_clear()
        internal_token._private_key.cache_clear()
