from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.logger import logger

# ── Sentry（本番のみ）────────────────────────────────────────────────────────
if settings.ENV == "production" and settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.1,
        environment=settings.ENV,
    )


# ── Lifespan（起動/停止フック）───────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("JobSync API starting up...")
    async with engine.begin() as conn:
        # 開発環境では全テーブルを自動作成（本番は alembic upgrade head を使用）
        if settings.ENV == "development":
            await conn.run_sync(Base.metadata.create_all)
    logger.info("Database ready")
    yield
    logger.info("JobSync API shutting down...")
    await engine.dispose()


# ── FastAPI アプリケーション ──────────────────────────────────────────────────
app = FastAPI(
    title="JobSync API",
    description="就活管理自動化サービス — メール連携型スケジュール自動登録",
    version="1.0.0",
    lifespan=lifespan,
    # 本番環境では Swagger UI を非公開にする
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "version": "1.0.0", "env": settings.ENV}
