from __future__ import annotations

import sys
from collections.abc import AsyncGenerator, Awaitable, Callable
from pathlib import Path
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app import models as _models  # noqa: F401
from app.api.v1 import auth, companies, schedules, users
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.errors import APIError
from app.models.user import User

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def test_schema() -> AsyncGenerator[str, None]:
    schema_name = f"test_{uuid4().hex}"
    admin_engine = create_async_engine(settings.DATABASE_URL)

    async with admin_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))

    try:
        yield schema_name
    finally:
        async with admin_engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        await admin_engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def test_engine(test_schema: str) -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(
        settings.DATABASE_URL,
        connect_args={"server_settings": {"search_path": test_schema}},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        yield engine
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )

    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()

    @app.exception_handler(APIError)
    async def api_error_handler(_: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": str(exc.detail), "code": exc.code},
        )

    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(schedules.router, prefix="/api/v1/schedules", tags=["schedules"])
    app.include_router(companies.router, prefix="/api/v1/companies", tags=["companies"])
    app.include_router(users.router, prefix="/api/v1/users", tags=["users"])

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
            yield async_client
    finally:
        app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def user_factory(
    db_session: AsyncSession,
) -> Callable[[], Awaitable[User]]:
    async def _create_user() -> User:
        user = User(email=f"user-{uuid4().hex}@example.com")
        db_session.add(user)
        await db_session.flush()
        return user

    return _create_user
