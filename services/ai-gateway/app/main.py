from __future__ import annotations
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .config import get_settings
from .db import apply_migrations, close_pool, init_pool
from .routes.ai import router as ai_router

logger = logging.getLogger("ai-gateway")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    pool = await init_pool(settings.database_url)
    # 启动时跑 migrations (幂等). 注意: ai_tasks 表依赖 auth/project 的 teams/users/projects.
    # 这些表预期已由上游服务建立 (或 docker-compose init).
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    mig_dir = os.path.join(here, "migrations")
    if os.path.isdir(mig_dir):
        try:
            await apply_migrations(pool, mig_dir)
        except Exception as e:
            logger.warning(f"apply_migrations: {e}")
    yield
    await close_pool()


app = FastAPI(title="ai-gateway", version="0.2.0", lifespan=lifespan)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router, prefix="/v1/ai")


@app.get("/healthz", response_class=PlainTextResponse)
async def healthz():
    return "ok"
