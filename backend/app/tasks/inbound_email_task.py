from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from email.utils import parseaddr
from typing import Any
from uuid import UUID

from celery import Task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logger import logger
from app.models.company import Company, CompanyStatus
from app.models.email import Email
from app.models.schedule import Schedule, ScheduleType
from app.services.email_analyzer import EmailAnalysisResult, EmailAnalyzer
from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, default_retry_delay=300)
def process_inbound_email_task(
    self: Task,
    user_id: str,
    email_data: dict[str, Any],
) -> dict[str, int | str]:
    """
    email_data = {
        "message_id": str,
        "subject": str,
        "sender": str,  # "Name <email@example.com>" 形式
        "body": str,    # プレーンテキスト
        "received_at": str  # ISO8601
    }
    """
    try:
        return asyncio.run(_process_inbound_email(user_id, email_data))
    except Exception as exc:  # noqa: BLE001
        retry_count = int(self.request.retries)
        max_retries = int(self.max_retries) if self.max_retries is not None else 3
        if retry_count >= max_retries:
            logger.exception("Inbound email processing failed after retries user_id=%s", user_id)
            raise

        base_delay = int(self.default_retry_delay) if self.default_retry_delay is not None else 300
        countdown = base_delay * (2**retry_count)
        logger.warning(
            "Retrying inbound email processing user_id=%s attempt=%s countdown=%s error=%s",
            user_id,
            retry_count + 1,
            countdown,
            str(exc),
        )
        raise self.retry(exc=exc, countdown=countdown) from exc


async def _process_inbound_email(
    user_id: str,
    email_data: dict[str, Any],
) -> dict[str, int | str]:
    analyzer = EmailAnalyzer()
    user_uuid = UUID(user_id)

    message_id = _coerce_text(email_data.get("message_id")) or None
    subject = _coerce_text(email_data.get("subject"))
    sender = _coerce_text(email_data.get("sender"))
    body = _coerce_text(email_data.get("body"))
    received_at = _parse_received_at(_coerce_text(email_data.get("received_at")))
    now = datetime.now(UTC)

    async with AsyncSessionLocal() as session:
        if message_id is not None:
            duplicate_result = await session.execute(
                select(Email.id).where(
                    Email.user_id == user_uuid,
                    Email.message_id == message_id,
                )
            )
            if duplicate_result.scalar_one_or_none() is not None:
                return {"status": "duplicate", "created_schedules": 0}

        analysis = await analyzer.analyze(
            subject=subject,
            body=body,
            sender=sender,
            received_at=received_at,
        )

        if not analysis.is_job_related:
            return {"status": "ignored", "created_schedules": 0}

        sender_name, sender_email = parseaddr(sender)
        email_row = Email(
            user_id=user_uuid,
            message_id=message_id,
            subject=subject or None,
            sender_email=sender_email or None,
            sender_name=sender_name or None,
            received_at=received_at,
            body_snippet=_build_snippet(body),
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

        created_schedules = 0
        for event in analysis.extracted_events:
            start_at = _parse_event_datetime(event.datetime, received_at)
            schedule_row = Schedule(
                user_id=user_uuid,
                company_id=company.id if company is not None else None,
                type=_to_schedule_type(event.type),
                title=event.title or subject or "選考予定",
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

        await session.commit()

    return {
        "status": "processed",
        "created_schedules": created_schedules,
    }


def _coerce_text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _parse_received_at(value: str) -> datetime:
    if not value:
        return datetime.now(UTC)

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(UTC)

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


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


async def _get_or_create_company(
    session: AsyncSession,
    user_id: UUID,
    company_name: str | None,
) -> Company | None:
    normalized_name = company_name.strip() if isinstance(company_name, str) else ""
    if not normalized_name:
        return None

    result = await session.execute(
        select(Company).where(
            Company.user_id == user_id,
            Company.name == normalized_name,
        )
    )
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
