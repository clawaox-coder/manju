"""pytest 配置 + fixtures: testcontainers pg + 应用 auth/project/ai 迁移 +
manju_app 非 owner pool + RS256 signer + 2 个 team fixture (含 project).

设计要点:
  - PG 容器与 schema/seed 都在 session 内只跑一次
  - 每个测试用 httpx.AsyncClient + asgi_lifespan.LifespanManager 拿一个干净 app pool
  - 避免 TestClient (anyio threadpool) 与 asyncpg pool 跨 event loop 冲突
"""

from __future__ import annotations
import asyncio
import os
import sys
import tempfile
import time
import uuid as uuidlib
from dataclasses import dataclass
from pathlib import Path

import asyncpg
import pytest_asyncio
from jose import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from testcontainers.postgres import PostgresContainer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_ISSUER = "manju-auth-test"


@dataclass
class TeamFixture:
    team_id: str
    owner_id: str
    viewer_id: str
    project_id: str
    owner_token: str
    viewer_token: str


@dataclass
class Harness:
    admin_dsn: str
    app_dsn: str
    pub_pem: str
    priv_pem: str
    pub_path: str
    team_a: TeamFixture
    team_b: TeamFixture


def _find_migrations_dir(svc: str) -> Path:
    # __file__ → ai-gateway/tests/conftest.py
    return Path(__file__).resolve().parents[2] / svc / "migrations"


def _gen_rs256_key() -> tuple[str, str]:
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    pub_pem = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return priv_pem, pub_pem


def _sign_access(priv_pem: str, user_id: str, team_id: str, role: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "iss": TEST_ISSUER,
            "sub": user_id,
            "team_id": team_id,
            "role": role,
            "iat": now,
            "exp": now + 900,
            "jti": f"{user_id}-{now}",
        },
        priv_pem,
        algorithm="RS256",
    )


async def _apply_all_migrations(conn: asyncpg.Connection) -> None:
    for svc in ["auth-service", "project-service", "script-service", "ai-gateway"]:
        d = _find_migrations_dir(svc)
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if not f.name.endswith(".sql"):
                continue
            sql = f.read_text()
            await conn.execute(sql)


async def _seed_team(admin: asyncpg.Connection, label: str, priv_pem: str) -> TeamFixture:
    team_id = str(uuidlib.uuid4())
    owner_id = str(uuidlib.uuid4())
    viewer_id = str(uuidlib.uuid4())
    project_id = str(uuidlib.uuid4())
    await admin.execute("INSERT INTO teams (id, name) VALUES ($1, $2)", uuidlib.UUID(team_id), f"Team {label}")
    await admin.execute(
        "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
        uuidlib.UUID(owner_id), f"owner-{label}-{owner_id[:6]}@example.com", f"Owner {label}",
    )
    await admin.execute(
        "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
        uuidlib.UUID(viewer_id), f"viewer-{label}-{viewer_id[:6]}@example.com", f"Viewer {label}",
    )
    await admin.execute(
        "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')",
        uuidlib.UUID(team_id), uuidlib.UUID(owner_id),
    )
    await admin.execute(
        "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'viewer')",
        uuidlib.UUID(team_id), uuidlib.UUID(viewer_id),
    )
    await admin.execute(
        "INSERT INTO projects (id, team_id, owner_id, name) VALUES ($1, $2, $3, $4)",
        uuidlib.UUID(project_id), uuidlib.UUID(team_id), uuidlib.UUID(owner_id), f"Project {label}",
    )
    return TeamFixture(
        team_id=team_id, owner_id=owner_id, viewer_id=viewer_id, project_id=project_id,
        owner_token=_sign_access(priv_pem, owner_id, team_id, "owner"),
        viewer_token=_sign_access(priv_pem, viewer_id, team_id, "viewer"),
    )


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def harness() -> Harness:
    # PostgresContainer 同步, with 内部包. 不在 async 里 with, 避免 reentry 问题.
    pgc = PostgresContainer("postgres:16-alpine", username="manju", password="manju", dbname="manju_test")
    pgc.start()
    try:
        sqlalchemy_url = pgc.get_connection_url()
        from urllib.parse import urlparse
        u = urlparse(sqlalchemy_url.replace("+psycopg2", ""))
        admin_dsn = f"postgres://manju:manju@{u.hostname}:{u.port}/manju_test"

        admin = await asyncpg.connect(dsn=admin_dsn)
        try:
            await _apply_all_migrations(admin)
            try:
                await admin.execute("CREATE ROLE manju_app WITH LOGIN PASSWORD 'app'")
            except asyncpg.exceptions.DuplicateObjectError:
                pass
            for stmt in [
                "GRANT USAGE ON SCHEMA public TO manju_app",
                "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO manju_app",
                "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO manju_app",
                "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO manju_app",
            ]:
                await admin.execute(stmt)

            priv_pem, pub_pem = _gen_rs256_key()
            team_a = await _seed_team(admin, "A", priv_pem)
            team_b = await _seed_team(admin, "B", priv_pem)
        finally:
            await admin.close()

        app_dsn = admin_dsn.replace("manju:manju@", "manju_app:app@")

        # 写公钥到临时文件
        with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as f:
            f.write(pub_pem)
            pub_path = f.name

        # 设置 env, 让 app config 在每个测试初始化时读到
        os.environ["DATABASE_URL"] = app_dsn
        os.environ["JWT_PUBLIC_KEY_PATH"] = pub_path
        os.environ["JWT_ISSUER"] = TEST_ISSUER
        os.environ["ANTHROPIC_API_KEY"] = "sk-placeholder"  # 默认无真 key, 跳真上游
        # 显式清掉 shell 里可能继承的中转凭据, 否则 pydantic-settings 会读到, 测试预期失效.
        os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)
        os.environ.pop("ANTHROPIC_BASE_URL", None)

        yield Harness(
            admin_dsn=admin_dsn,
            app_dsn=app_dsn,
            pub_pem=pub_pem,
            priv_pem=priv_pem,
            pub_path=pub_path,
            team_a=team_a,
            team_b=team_b,
        )
    finally:
        pgc.stop()


@pytest_asyncio.fixture(loop_scope="session")
async def client(harness: Harness):
    """每个测试拿干净的 AsyncClient + lifespan (新建 pool)."""
    from httpx import AsyncClient, ASGITransport
    from asgi_lifespan import LifespanManager
    import importlib

    # 清 settings + db pool 缓存让 app 重新初始化
    from app.config import get_settings
    get_settings.cache_clear()
    import app.db as db_mod
    db_mod._pool = None
    import app.auth as auth_mod
    auth_mod._public_key = None

    # main 用 module-level get_settings() 抓 CORS, 必须 reload main 以读最新 env
    if "app.main" in sys.modules:
        importlib.reload(sys.modules["app.main"])
    from app.main import app  # noqa: E402

    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture(loop_scope="session")
async def clean_tables(harness: Harness):
    """每个测试前 truncate ai_tasks."""
    admin = await asyncpg.connect(dsn=harness.admin_dsn)
    try:
        await admin.execute("TRUNCATE ai_tasks RESTART IDENTITY CASCADE")
        await admin.execute("TRUNCATE shots RESTART IDENTITY CASCADE")
    finally:
        await admin.close()
    yield
