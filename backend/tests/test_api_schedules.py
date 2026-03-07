from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.company import Company, CompanyStatus
from app.models.schedule import Schedule, ScheduleType
from app.models.user import User

pytestmark = pytest.mark.asyncio

UserFactory = Callable[[], Awaitable[User]]


def _auth_headers(user_id: UUID) -> dict[str, str]:
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}


async def test_create_schedule_success(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    company = Company(
        user_id=user.id,
        name="株式会社テスト",
        status=CompanyStatus.INTERESTED,
        priority=3,
    )
    db_session.add(company)
    await db_session.flush()

    payload = {
        "title": "一次面接",
        "type": ScheduleType.INTERVIEW.value,
        "scheduled_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        "company_id": str(company.id),
        "description": "オンライン面接",
        "location": "Zoom",
        "online_url": "https://example.com/interview",
        "reminder_1day": True,
    }
    response = await client.post(
        "/api/v1/schedules",
        json=payload,
        headers=_auth_headers(user.id),
    )

    body = response.json()
    assert response.status_code == 201
    assert body["title"] == "一次面接"
    assert body["type"] == ScheduleType.INTERVIEW.value
    assert body["user_id"] == str(user.id)
    assert body["company_id"] == str(company.id)
    assert body["company_name"] == "株式会社テスト"
    assert body["reminder_1day"] is True


async def test_create_schedule_past_date(
    client: AsyncClient,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    payload = {
        "title": "過去予定",
        "type": ScheduleType.EVENT.value,
        "scheduled_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
    }

    response = await client.post(
        "/api/v1/schedules",
        json=payload,
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 422


async def test_get_schedules_authenticated(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    other_user: User = await user_factory()

    db_session.add_all(
        [
            Schedule(
                user_id=user.id,
                type=ScheduleType.INTERVIEW,
                title="面接A",
                scheduled_at=datetime.now(UTC) + timedelta(days=1),
            ),
            Schedule(
                user_id=user.id,
                type=ScheduleType.EXAM,
                title="筆記試験",
                scheduled_at=datetime.now(UTC) + timedelta(days=3),
            ),
            Schedule(
                user_id=other_user.id,
                type=ScheduleType.EVENT,
                title="他ユーザー予定",
                scheduled_at=datetime.now(UTC) + timedelta(days=2),
            ),
        ]
    )
    await db_session.flush()

    response = await client.get("/api/v1/schedules", headers=_auth_headers(user.id))

    body = response.json()
    assert response.status_code == 200
    assert len(body) == 2
    assert all(item["user_id"] == str(user.id) for item in body)


async def test_get_schedules_unauthenticated(client: AsyncClient) -> None:
    response = await client.get("/api/v1/schedules")
    assert response.status_code == 401


async def test_update_own_schedule(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    schedule = Schedule(
        user_id=user.id,
        type=ScheduleType.INTERVIEW,
        title="変更前タイトル",
        scheduled_at=datetime.now(UTC) + timedelta(days=1),
    )
    db_session.add(schedule)
    await db_session.flush()

    response = await client.patch(
        f"/api/v1/schedules/{schedule.id}",
        json={"title": "変更後タイトル", "reminder_1day": True},
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "変更後タイトル"
    assert body["reminder_1day"] is True

    updated_schedule = (
        await db_session.execute(
            select(Schedule).where(Schedule.id == schedule.id, Schedule.user_id == user.id)
        )
    ).scalar_one()
    assert updated_schedule.title == "変更後タイトル"
    assert updated_schedule.reminder_1day is True


async def test_update_others_schedule(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    owner: User = await user_factory()
    attacker: User = await user_factory()
    schedule = Schedule(
        user_id=owner.id,
        type=ScheduleType.INTERVIEW,
        title="保護対象予定",
        scheduled_at=datetime.now(UTC) + timedelta(days=2),
    )
    db_session.add(schedule)
    await db_session.flush()

    response = await client.patch(
        f"/api/v1/schedules/{schedule.id}",
        json={"title": "不正更新"},
        headers=_auth_headers(attacker.id),
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN_SCHEDULE"


async def test_delete_schedule(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    schedule = Schedule(
        user_id=user.id,
        type=ScheduleType.EVENT,
        title="削除予定",
        scheduled_at=datetime.now(UTC) + timedelta(days=4),
    )
    db_session.add(schedule)
    await db_session.flush()

    delete_response = await client.delete(
        f"/api/v1/schedules/{schedule.id}",
        headers=_auth_headers(user.id),
    )
    assert delete_response.status_code == 204

    after_delete = await client.patch(
        f"/api/v1/schedules/{schedule.id}",
        json={"title": "再更新"},
        headers=_auth_headers(user.id),
    )
    assert after_delete.status_code == 404
