from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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


async def test_get_forwarding_address_generates_and_persists(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await user_factory()
    generated_forwarding_email = "u_a1b2c3d4@mail.jobsync.app"

    called_domains: list[str] = []

    def _fake_generator(domain: str) -> str:
        called_domains.append(domain)
        return generated_forwarding_email

    monkeypatch.setattr("app.api.v1.users.generate_forwarding_address", _fake_generator)

    response = await client.get(
        "/api/v1/users/me/forwarding-address",
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 200
    assert response.json() == {"forwarding_email": generated_forwarding_email}
    assert called_domains == [settings.FORWARDING_EMAIL_DOMAIN]

    updated_user = (
        await db_session.execute(
            select(User).where(
                User.id == user.id,
            )
        )
    ).scalar_one()
    assert updated_user.forwarding_email == generated_forwarding_email


async def test_get_forwarding_address_returns_existing_value(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await user_factory()
    existing_forwarding_email = "u_existing1@mail.jobsync.app"
    user.forwarding_email = existing_forwarding_email
    db_session.add(user)
    await db_session.flush()

    def _unexpected_call(_: str) -> str:
        raise AssertionError("generate_forwarding_address should not be called")

    monkeypatch.setattr("app.api.v1.users.generate_forwarding_address", _unexpected_call)

    response = await client.get(
        "/api/v1/users/me/forwarding-address",
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 200
    assert response.json() == {"forwarding_email": existing_forwarding_email}


async def test_get_forwarding_address_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/api/v1/users/me/forwarding-address")
    assert response.status_code == 401
