from __future__ import annotations

import hashlib
import hmac
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1 import inbound
from app.core.config import settings
from app.core.database import get_db
from app.models.email import Email
from app.models.user import User

pytestmark = pytest.mark.anyio

UserFactory = Callable[[], Awaitable[User]]


class DummyInboundTask:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []

    def delay(self, user_id: str, email_data: dict[str, str]) -> object:
        self.calls.append((user_id, email_data))
        return type("Result", (), {"id": "task-1"})()


@pytest.fixture
async def inbound_client(
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()
    app.include_router(inbound.router, prefix="/api/v1/emails/inbound", tags=["inbound"])

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app, lifespan="off")

    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _build_signature(timestamp: str, token: str, key: str) -> str:
    return hmac.new(
        key.encode(),
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def test_inbound_invalid_signature_returns_400(
    inbound_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "test-signing-key")

    response = await inbound_client.post(
        "/api/v1/emails/inbound",
        data={
            "recipient": "u_unknown@mail.jobsync.app",
            "sender": "recruit@example.com",
            "subject": "test",
            "body-plain": "hello",
            "Message-Id": "<msg-1@example.com>",
            "timestamp": "1700000000",
            "token": "token-1",
            "signature": "invalid",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid mailgun signature"


async def test_inbound_unknown_user_returns_200_without_enqueue(
    inbound_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "development")
    task = DummyInboundTask()
    monkeypatch.setattr(inbound, "process_inbound_email_task", task)

    response = await inbound_client.post(
        "/api/v1/emails/inbound",
        data={
            "recipient": "u_unknown@mail.jobsync.app",
            "sender": "recruit@example.com",
            "subject": "test",
            "body-plain": "hello",
            "Message-Id": "<msg-2@example.com>",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}
    assert task.calls == []


async def test_inbound_duplicate_message_id_returns_200(
    inbound_client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "development")

    user = await user_factory()
    user.forwarding_email = "u_dup@mail.jobsync.app"
    db_session.add(user)

    db_session.add(
        Email(
            user_id=user.id,
            message_id="<dup-message@example.com>",
            subject="既存メール",
            sender_email="recruit@example.com",
            sender_name="Recruit",
            received_at=datetime.now(UTC),
            is_job_related=True,
            parsed_data={},
            processed_at=datetime.now(UTC),
        )
    )
    await db_session.flush()

    task = DummyInboundTask()
    monkeypatch.setattr(inbound, "process_inbound_email_task", task)

    response = await inbound_client.post(
        "/api/v1/emails/inbound",
        data={
            "recipient": user.forwarding_email,
            "sender": "Recruit <recruit@example.com>",
            "subject": "選考日程",
            "body-plain": "本文",
            "Message-Id": "<dup-message@example.com>",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "duplicate"}
    assert task.calls == []


async def test_inbound_gmail_confirmation_fetches_url(
    inbound_client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "development")

    user = await user_factory()
    user.forwarding_email = "u_confirm@mail.jobsync.app"
    db_session.add(user)
    await db_session.flush()

    fetched_urls: list[str] = []

    async def fake_fetch(url: str) -> None:
        fetched_urls.append(url)

    task = DummyInboundTask()
    monkeypatch.setattr(inbound, "_fetch_gmail_confirmation_url", fake_fetch)
    monkeypatch.setattr(inbound, "process_inbound_email_task", task)

    response = await inbound_client.post(
        "/api/v1/emails/inbound",
        data={
            "recipient": user.forwarding_email,
            "sender": "forwarding-noreply@google.com",
            "subject": "Gmail Forwarding Confirmation",
            "body-plain": (
                "Confirm here: "
                "https://mail.google.com/mail/u/0/?ui=2&ik=abc&view=att&th=1234567890"
            ),
            "Message-Id": "<confirm@example.com>",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert len(fetched_urls) == 1
    assert fetched_urls[0].startswith("https://mail.google.com/mail/")
    assert task.calls == []


async def test_inbound_valid_payload_enqueues_task(
    inbound_client: AsyncClient,
    db_session: AsyncSession,
    user_factory: UserFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "test-signing-key")

    user = await user_factory()
    user.forwarding_email = "u_valid@mail.jobsync.app"
    db_session.add(user)
    await db_session.flush()

    task = DummyInboundTask()
    monkeypatch.setattr(inbound, "process_inbound_email_task", task)

    timestamp = "1700000000"
    token = "token-abc"
    signature = _build_signature(timestamp=timestamp, token=token, key="test-signing-key")

    response = await inbound_client.post(
        "/api/v1/emails/inbound",
        data={
            "recipient": user.forwarding_email,
            "sender": "Recruit Team <recruit@example.com>",
            "subject": "面接日程のお知らせ",
            "body-plain": "来週の面接について",
            "Message-Id": "<valid-message@example.com>",
            "timestamp": timestamp,
            "token": token,
            "signature": signature,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "queued"}
    assert len(task.calls) == 1
    queued_user_id, email_data = task.calls[0]
    assert queued_user_id == str(user.id)
    assert email_data["message_id"] == "<valid-message@example.com>"
    assert email_data["subject"] == "面接日程のお知らせ"
    assert email_data["sender"] == "Recruit Team <recruit@example.com>"
    assert email_data["body"] == "来週の面接について"
    assert isinstance(datetime.fromisoformat(email_data["received_at"]), datetime)
