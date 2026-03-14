from __future__ import annotations

from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import UTC, datetime
from types import TracebackType
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1 import inbound
from app.core.config import settings
from app.core.database import get_db
from app.models.email import Email
from app.models.user import User
from app.services.email_analyzer import EmailAnalysisResult
from app.tasks import inbound_email_task
from tests.utils.mailgun_payload import build_mailgun_payload

pytestmark = pytest.mark.asyncio

UserFactory = Callable[[], Awaitable[User]]


class SessionContextManager:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def __aenter__(self) -> AsyncSession:
        return self._session

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None


@pytest.fixture
async def inbound_client(
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()
    app.include_router(inbound.router, prefix="/api/v1/emails/inbound", tags=["inbound"])

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client
    finally:
        app.dependency_overrides.clear()


async def test_inbound_signature_failure_returns_401_outside_development(
    inbound_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "test-signing-key")

    payload = build_mailgun_payload(
        recipient="u_unknown@mail.jobsync.app",
        timestamp="1700000000",
    )
    payload["signature"] = "invalid-signature"

    response = await inbound_client.post("/api/v1/emails/inbound", data=payload)

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid mailgun signature"


async def test_inbound_signature_verification_is_skipped_in_development(
    inbound_client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "development")

    user = await user_factory()
    user.forwarding_email = "u_dev_skip@mail.jobsync.app"
    db_session.add(user)
    await db_session.flush()

    payload = build_mailgun_payload(
        recipient=user.forwarding_email,
        sender="Recruit Team <recruit@example.com>",
        subject="面接のご案内",
        body_plain="明日の面接にご参加ください。",
    )
    payload["signature"] = "invalid-signature"

    with patch("app.api.v1.inbound.process_inbound_email_task.delay") as delay_mock:
        response = await inbound_client.post("/api/v1/emails/inbound", data=payload)

    assert response.status_code == 200
    assert response.json() == {"status": "queued"}
    delay_mock.assert_called_once()


async def test_inbound_duplicate_message_id_returns_duplicate_on_second_post(
    inbound_client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "development")

    user = await user_factory()
    user.forwarding_email = "u_dup_twice@mail.jobsync.app"
    db_session.add(user)
    await db_session.flush()

    duplicate_message_id = "<dup-2times@example.com>"
    payload = build_mailgun_payload(
        recipient=user.forwarding_email,
        sender="Recruit Team <recruit@example.com>",
        subject="一次面接のご案内",
        body_plain="面接日時をご確認ください。",
    )
    payload["Message-Id"] = duplicate_message_id

    with patch("app.api.v1.inbound.process_inbound_email_task.delay") as delay_mock:
        first_response = await inbound_client.post("/api/v1/emails/inbound", data=payload)
        assert first_response.status_code == 200
        assert first_response.json() == {"status": "queued"}

        # 1回目のタスク処理完了を模擬して、2回目POST時に重複判定できる状態を作る
        db_session.add(
            Email(
                user_id=user.id,
                message_id=duplicate_message_id,
                subject="一次面接のご案内",
                sender_email="recruit@example.com",
                sender_name="Recruit Team",
                received_at=datetime.now(UTC),
                is_job_related=True,
                parsed_data={},
                processed_at=datetime.now(UTC),
            )
        )
        await db_session.flush()

        second_response = await inbound_client.post("/api/v1/emails/inbound", data=payload)

    assert second_response.status_code == 200
    assert second_response.json() == {"status": "duplicate"}
    assert delay_mock.call_count == 1


async def test_process_inbound_email_ignores_non_job_related_email(
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await user_factory()

    def _session_local_override() -> SessionContextManager:
        return SessionContextManager(db_session)

    monkeypatch.setattr(inbound_email_task, "AsyncSessionLocal", _session_local_override)

    mocked_analysis = EmailAnalysisResult(
        is_job_related=False,
        confidence=0.99,
        email_type="not_job",
        company_name=None,
        extracted_events=[],
        company_info={},
    )

    with (
        patch.object(inbound_email_task.EmailAnalyzer, "__init__", return_value=None),
        patch.object(
            inbound_email_task.EmailAnalyzer,
            "analyze",
            new_callable=AsyncMock,
        ) as analyze_mock,
    ):
        analyze_mock.return_value = mocked_analysis

        result = await inbound_email_task._process_inbound_email(
            user_id=str(user.id),
            email_data={
                "message_id": "<non-job@example.com>",
                "subject": "セールのお知らせ",
                "sender": "newsletter@example.com",
                "body": "週末限定セールです",
                "received_at": datetime.now(UTC).isoformat(),
            },
        )

    assert result == {"status": "ignored", "created_schedules": 0}
    analyze_mock.assert_awaited_once()

    existing_email = await db_session.execute(
        select(Email.id).where(
            Email.user_id == user.id,
            Email.message_id == "<non-job@example.com>",
        )
    )
    assert existing_email.scalar_one_or_none() is None
