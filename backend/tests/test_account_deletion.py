from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.company import Company, CompanyStatus
from app.models.email import Email
from app.models.schedule import Schedule, ScheduleType
from app.models.user import User

pytestmark = pytest.mark.asyncio

UserFactory = Callable[[], Awaitable[User]]


def _auth_headers(user_id: UUID) -> dict[str, str]:
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}


async def test_delete_account_returns_204_and_same_jwt_becomes_unauthorized(
    client: AsyncClient,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()
    headers = _auth_headers(user.id)

    delete_response = await client.delete("/api/v1/auth/me", headers=headers)
    assert delete_response.status_code == 204
    assert delete_response.content == b""

    me_response = await client.get("/api/v1/users/me", headers=headers)
    assert me_response.status_code == 401


async def test_delete_account_cascades_related_records(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()

    company = Company(
        user_id=user.id,
        name="Example Corp",
        status=CompanyStatus.APPLIED,
        priority=3,
    )
    db_session.add(company)
    await db_session.flush()

    email = Email(
        user_id=user.id,
        message_id=f"<account-deletion-{user.id}@example.com>",
        subject="選考のご案内",
        sender_email="recruit@example.com",
        received_at=datetime.now(UTC),
    )
    db_session.add(email)
    await db_session.flush()

    schedule = Schedule(
        user_id=user.id,
        company_id=company.id,
        source_email_id=email.id,
        type=ScheduleType.INTERVIEW,
        title="一次面接",
        scheduled_at=datetime.now(UTC),
    )
    db_session.add(schedule)
    await db_session.flush()

    delete_response = await client.delete("/api/v1/auth/me", headers=_auth_headers(user.id))
    assert delete_response.status_code == 204

    deleted_user = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert deleted_user is None

    remaining_companies = (
        await db_session.execute(select(Company).where(Company.user_id == user.id))
    ).scalars().all()
    remaining_schedules = (
        await db_session.execute(select(Schedule).where(Schedule.user_id == user.id))
    ).scalars().all()
    remaining_emails = (
        await db_session.execute(select(Email).where(Email.user_id == user.id))
    ).scalars().all()

    assert remaining_companies == []
    assert remaining_schedules == []
    assert remaining_emails == []
