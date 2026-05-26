from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .config import get_settings
from .routes.ai import router as ai_router

app = FastAPI(title="ai-gateway", version="0.1.0")

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
