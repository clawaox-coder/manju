from dataclasses import dataclass
from fastapi import Request, HTTPException
from jose import jwt, JWTError
from .config import get_settings

_public_key: str | None = None


def _load_key() -> str:
    global _public_key
    if _public_key is None:
        settings = get_settings()
        with open(settings.jwt_public_key_path, "r") as f:
            _public_key = f.read()
    return _public_key


@dataclass
class AuthContext:
    user_id: str
    team_id: str
    role: str
    jti: str


async def require_auth(request: Request) -> AuthContext:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少 Authorization Bearer token")
    token = header[len("Bearer "):]
    key = _load_key()
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.jwt_issuer,
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail=str(e))
    sub = payload.get("sub")
    team_id = payload.get("team_id")
    role = payload.get("role")
    jti = payload.get("jti")
    if not all([sub, team_id, role, jti]):
        raise HTTPException(status_code=401, detail="token claims 缺失")
    return AuthContext(user_id=sub, team_id=team_id, role=role, jti=jti)
