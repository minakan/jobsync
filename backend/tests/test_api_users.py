from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User

pytestmark = pytest.mark.anyio

UserFactory = Callable[[], Awaitable[User]]


def _auth_headers(user_id: UUID) -> dict[str, str]:
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}


async def test_update_fcm_token_success(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()

    response = await client.patch(
        "/api/v1/users/me/fcm-token",
        json={"fcm_token": "expo-device-token-123"},
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["email"] == user.email
    assert "fcm_token" not in body

    updated_user = (
        await db_session.execute(
            select(User).where(
                User.id == user.id,
            )
        )
    ).scalar_one()
    assert updated_user.fcm_token == "expo-device-token-123"


async def test_update_fcm_token_unauthorized(client: AsyncClient) -> None:
    response = await client.patch(
        "/api/v1/users/me/fcm-token",
        json={"fcm_token": "expo-device-token-123"},
    )

    assert response.status_code == 401


async def test_update_fcm_token_too_long(
    client: AsyncClient,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()
    too_long_token = "x" * 513

    response = await client.patch(
        "/api/v1/users/me/fcm-token",
        json={"fcm_token": too_long_token},
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 422
