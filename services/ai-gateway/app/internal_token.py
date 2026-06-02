"""Service-to-service token 签发.

ai-gateway 的后台任务(如 storyboard 生成)需要调 asset-service 取项目参考图,
但后台任务手里没有调用方 token(原请求已返回)。这里用共享 JWT 私钥自签一个
**短期(60s)**、与用户 access token 同构的 token,asset-service 的 verifier 原样接受。

claims 必须满足 asset-service middleware 的硬要求(见其 middleware.go):
  - sub 必须是**合法 UUID**(MustUserID 会 uuid.Parse,失败 panic)→ 用固定哨兵 UUID 标识服务
  - team_id / role 非空,role ∈ 合法集合 → 用 owner(需写权限)
  - iss 必须等于 manju-auth

dev 专用:让 ai-gateway 持共享私钥放大了攻破影响面,生产应改独立内部密钥或网关 mTLS
(见 openspec design「生产环境取舍」)。
"""

from __future__ import annotations
import time
import uuid
from functools import lru_cache

from jose import jwt

from .config import get_settings

# 固定哨兵 UUID:标识"ai-gateway 服务"这个调用主体(便于 asset-service 日志/审计区分)。
SERVICE_SUBJECT = "00000000-0000-0000-0000-0000a1a1a1a1"

S2S_TTL_SECONDS = 60


@lru_cache
def _private_key() -> str | None:
    s = get_settings()
    if not s.jwt_private_key_path:
        return None
    try:
        with open(s.jwt_private_key_path, "r") as f:
            return f.read()
    except OSError:
        return None


def has_s2s() -> bool:
    """是否具备签发 S2S token 的能力(私钥可读)。"""
    return _private_key() is not None


def mint_s2s_token(team_id: str, role: str = "owner") -> str:
    """为指定 team 签一个短期服务令牌。无私钥时抛 RuntimeError(调用方应先 has_s2s 判断或降级)。"""
    key = _private_key()
    if key is None:
        raise RuntimeError("S2S token 不可用:未配置 jwt_private_key_path")
    s = get_settings()
    now = int(time.time())
    claims = {
        "iss": s.jwt_issuer,
        "sub": SERVICE_SUBJECT,
        "team_id": team_id,
        "role": role,
        "iat": now,
        "exp": now + S2S_TTL_SECONDS,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, key, algorithm="RS256")
