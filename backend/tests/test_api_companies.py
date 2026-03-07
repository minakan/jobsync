from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
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


async def test_create_company_success(
    client: AsyncClient,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()

    response = await client.post(
        "/api/v1/companies",
        json={
            "name": "株式会社サンプル",
            "industry": "IT",
            "status": CompanyStatus.INTERESTED.value,
            "priority": 5,
            "notes": "第一志望",
        },
        headers=_auth_headers(user.id),
    )

    body = response.json()
    assert response.status_code == 201
    assert body["name"] == "株式会社サンプル"
    assert body["status"] == CompanyStatus.INTERESTED.value
    assert body["priority"] == 5
    assert body["schedules"] == []


async def test_create_duplicate_company(
    client: AsyncClient,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()

    first_response = await client.post(
        "/api/v1/companies",
        json={"name": "ＡＢＣ株式会社"},
        headers=_auth_headers(user.id),
    )
    assert first_response.status_code == 201

    duplicate_response = await client.post(
        "/api/v1/companies",
        json={"name": "abc株式会社"},
        headers=_auth_headers(user.id),
    )

    assert duplicate_response.status_code == 409
    assert duplicate_response.json() == {
        "detail": "同名の企業が既に登録されています",
        "code": "DUPLICATE_COMPANY",
    }


async def test_update_company_status(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    company = Company(
        user_id=user.id,
        name="履歴テスト株式会社",
        status=CompanyStatus.INTERESTED,
        priority=3,
    )
    db_session.add(company)
    await db_session.flush()

    response = await client.patch(
        f"/api/v1/companies/{company.id}",
        json={"status": CompanyStatus.APPLIED.value},
        headers=_auth_headers(user.id),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == CompanyStatus.APPLIED.value
    assert len(body["status_history"]) == 1
    assert body["status_history"][0]["from"] == CompanyStatus.INTERESTED.value
    assert body["status_history"][0]["to"] == CompanyStatus.APPLIED.value


async def test_get_company_stats(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    user: User = await user_factory()
    target_companies = [
        Company(
            user_id=user.id,
            name="応募済み1",
            status=CompanyStatus.APPLIED,
            priority=3,
        ),
        Company(
            user_id=user.id,
            name="応募済み2",
            status=CompanyStatus.APPLIED,
            priority=4,
        ),
        Company(
            user_id=user.id,
            name="内定済み",
            status=CompanyStatus.OFFERED,
            priority=5,
        ),
    ]
    db_session.add_all(target_companies)
    await db_session.flush()

    response = await client.get("/api/v1/companies/stats", headers=_auth_headers(user.id))

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 3
    assert body["applied_count"] == 2
    assert body["offered_count"] == 1
    assert body["pass_rate"] == 0.5
    assert body["status_counts"][CompanyStatus.APPLIED.value] == 2
    assert body["status_counts"][CompanyStatus.OFFERED.value] == 1


async def test_cannot_access_others_company(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    owner: User = await user_factory()
    attacker: User = await user_factory()
    company = Company(
        user_id=owner.id,
        name="他人企業",
        status=CompanyStatus.INTERESTED,
        priority=3,
    )
    db_session.add(company)
    await db_session.flush()

    # 他人企業に紐づく予定を作っても、企業本体は更新不可であることを確認する
    db_session.add(
        Schedule(
            user_id=owner.id,
            company_id=company.id,
            type=ScheduleType.EVENT,
            title="会社説明会",
            scheduled_at=datetime.now(UTC) + timedelta(days=2),
        )
    )
    await db_session.flush()

    response = await client.patch(
        f"/api/v1/companies/{company.id}",
        json={"notes": "不正アクセス"},
        headers=_auth_headers(attacker.id),
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN_COMPANY"
