from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any
from uuid import UUID

from celery import Task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logger import logger
from app.core.security import decrypt_token, encrypt_token
from app.models.company import Company, CompanyStatus
from app.models.email import Email
from app.models.email_connection import EmailConnection, EmailProvider
from app.models.schedule import Schedule, ScheduleType
from app.services.email_analyzer import EmailAnalysisResult, EmailAnalyzer
from app.services.gmail_service import GmailService
from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, default_retry_delay=300)
def sync_emails_task(self: Task, user_id: str) -> dict[str, int | str]:
    """
    1. email_connectionsからトークン取得（復号化）
    2. トークン期限チェック→必要に応じてリフレッシュ
    3. Gmail APIでlast_synced_at以降のメール取得
    4. 結果をemails/companies/schedulesテーブルに保存
    5. email_connections.last_synced_atを更新
    """
    try:
        return asyncio.run(_sync_emails(user_id))
    except Exception as exc:  # noqa: BLE001
        retry_count = int(self.request.retries)
        max_retries = int(self.max_retries) if self.max_retries is not None else 3
        if retry_count >= max_retries:
            logger.exception("Email sync failed after retries for user_id=%s", user_id)
            raise

        base_delay = int(self.default_retry_delay) if self.default_retry_delay is not None else 300
        countdown = base_delay * (2**retry_count)
        logger.warning(
            "Retrying email sync user_id=%s attempt=%s countdown=%s error=%s",
            user_id,
            retry_count + 1,
            countdown,
            str(exc),
        )
        raise self.retry(exc=exc, countdown=countdown) from exc


async def _sync_emails(user_id: str) -> dict[str, int | str]:
    gmail_service = GmailService()
    analyzer = EmailAnalyzer()
    user_uuid = UUID(user_id)
    now = datetime.now(UTC)

    async with AsyncSessionLocal() as session:
        connection = await _get_gmail_connection(session, user_uuid)

        access_token = decrypt_token(connection.access_token)
        refresh_token = decrypt_token(connection.refresh_token)

        if connection.token_expiry is None or connection.token_expiry <= now + timedelta(minutes=1):
            access_token, expires_at = await gmail_service.refresh_access_token(refresh_token)
            connection.access_token = encrypt_token(access_token)
            connection.token_expiry = expires_at

        days_back = _compute_days_back(connection.last_synced_at, now)
        messages = await gmail_service.get_recent_emails(
            access_token=access_token,
            refresh_token=refresh_token,
            days_back=days_back,
            max_results=100,
        )

        message_ids = [
            message_id
            for message in messages
            if isinstance(message, dict)
            and isinstance((message_id := message.get("id")), str)
            and message_id
        ]
        existing_ids = await _get_existing_message_ids(session, user_uuid, message_ids)

        synced_count = 0
        created_schedules = 0

        for message_id in message_ids:
            if message_id in existing_ids:
                continue

            detail = await gmail_service.get_email_detail(access_token=access_token, message_id=message_id)
            received_at = _parse_received_at(detail)

            sender_raw = str(detail.get("from", ""))
            sender_name, sender_email = parseaddr(sender_raw)

            subject = detail.get("subject")
            body = detail.get("body")
            subject_text = subject if isinstance(subject, str) else ""
            body_text = body if isinstance(body, str) else ""

            analysis = await analyzer.analyze(
                subject=subject_text,
                body=body_text,
                sender=sender_raw,
                received_at=received_at,
            )

            email_row = Email(
                user_id=user_uuid,
                message_id=message_id,
                subject=subject_text or None,
                sender_email=sender_email or None,
                sender_name=sender_name or None,
                received_at=received_at,
                body_snippet=_build_snippet(body_text),
                is_job_related=analysis.is_job_related,
                confidence_score=analysis.confidence,
                parsed_data=_build_parsed_data(analysis),
                processed_at=now,
            )
            session.add(email_row)
            await session.flush()

            company = await _get_or_create_company(
                session=session,
                user_id=user_uuid,
                company_name=analysis.company_name,
            )

            for event in analysis.extracted_events:
                start_at = _parse_event_datetime(event.datetime, received_at)
                schedule_row = Schedule(
                    user_id=user_uuid,
                    company_id=company.id if company is not None else None,
                    type=_to_schedule_type(event.type),
                    title=event.title or subject_text or "選考予定",
                    description=event.description or None,
                    scheduled_at=start_at,
                    start_at=start_at,
                    end_at=start_at + timedelta(hours=1),
                    is_all_day=False,
                    online_url=event.url,
                    source_email_id=email_row.id,
                )
                session.add(schedule_row)
                created_schedules += 1

            synced_count += 1

        connection.last_synced_at = now
        await session.commit()

    return {
        "status": "success",
        "fetched_count": len(message_ids),
        "synced_count": synced_count,
        "created_schedules": created_schedules,
    }


async def _get_gmail_connection(session: AsyncSession, user_id: UUID) -> EmailConnection:
    stmt = select(EmailConnection).where(
        EmailConnection.user_id == user_id,
        EmailConnection.provider == EmailProvider.GMAIL,
    )
    result = await session.execute(stmt)
    connection = result.scalar_one_or_none()

    if connection is None:
        raise ValueError(f"Gmail connection not found for user_id={user_id}")
    return connection


async def _get_existing_message_ids(
    session: AsyncSession,
    user_id: UUID,
    message_ids: list[str],
) -> set[str]:
    if not message_ids:
        return set()

    stmt = select(Email.message_id).where(
        Email.user_id == user_id,
        Email.message_id.in_(message_ids),
    )
    result = await session.execute(stmt)
    return {value for value in result.scalars().all() if value is not None}


async def _get_or_create_company(
    session: AsyncSession,
    user_id: UUID,
    company_name: str | None,
) -> Company | None:
    normalized_name = company_name.strip() if isinstance(company_name, str) else ""
    if not normalized_name:
        return None

    stmt = select(Company).where(
        Company.user_id == user_id,
        Company.name == normalized_name,
    )
    result = await session.execute(stmt)
    company = result.scalar_one_or_none()

    if company is None:
        company = Company(
            user_id=user_id,
            name=normalized_name,
            status=CompanyStatus.INTERESTED,
            priority=3,
        )
        session.add(company)
        await session.flush()

    return company


def _compute_days_back(last_synced_at: datetime | None, now: datetime) -> int:
    if last_synced_at is None:
        return 30

    delta = now - last_synced_at
    return max(1, delta.days + 1)


def _parse_received_at(detail: dict[str, Any]) -> datetime:
    date_header = detail.get("date")
    if isinstance(date_header, str) and date_header:
        try:
            parsed = parsedate_to_datetime(date_header)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except (TypeError, ValueError):
            pass

    internal_date = detail.get("internal_date")
    if isinstance(internal_date, str) and internal_date.isdigit():
        return datetime.fromtimestamp(int(internal_date) / 1000, tz=UTC)

    return datetime.now(UTC)


def _parse_event_datetime(value: str | None, fallback: datetime) -> datetime:
    if not value:
        return fallback

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return fallback

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _to_schedule_type(event_type: str) -> ScheduleType:
    mapping = {
        "es_deadline": ScheduleType.ES_DEADLINE,
        "interview": ScheduleType.INTERVIEW,
        "exam": ScheduleType.EXAM,
        "event": ScheduleType.EVENT,
        "webtest": ScheduleType.WEBTEST,
    }
    return mapping.get(event_type.lower(), ScheduleType.OTHER)


def _build_parsed_data(analysis: EmailAnalysisResult) -> dict[str, object]:
    events: list[dict[str, object]] = [event.model_dump(mode="python") for event in analysis.extracted_events]
    return {
        "email_type": analysis.email_type,
        "company_name": analysis.company_name,
        "confidence": analysis.confidence,
        "extracted_events": events,
        "company_info": analysis.company_info,
    }


def _build_snippet(body: str) -> str | None:
    stripped = body.strip()
    if not stripped:
        return None
    return stripped[:1000]
