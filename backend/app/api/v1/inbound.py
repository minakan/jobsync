from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from email.utils import parseaddr
from functools import partial
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.logger import logger
from app.core.mailgun import verify_mailgun_signature
from app.models.email import Email
from app.models.user import User
from app.tasks.inbound_email_task import process_inbound_email_task

router = APIRouter()

_GMAIL_CONFIRMATION_SUBJECT_KEYWORDS = (
    "gmail forwarding confirmation",
    "gmailの転送確認",
)
_GMAIL_CONFIRMATION_URL_PATTERN = re.compile(r"https://mail\.google\.com/mail/[^\s<>()\"']+")


def _normalize_email_address(value: str) -> str:
    _, address = parseaddr(value)
    return address.strip().lower()


def _is_gmail_forwarding_confirmation(subject: str) -> bool:
    lowered = subject.lower()
    return any(keyword in lowered for keyword in _GMAIL_CONFIRMATION_SUBJECT_KEYWORDS)


def _extract_gmail_confirmation_url(body_plain: str) -> str | None:
    match = _GMAIL_CONFIRMATION_URL_PATTERN.search(body_plain)
    if match is None:
        return None
    return match.group(0)


async def _fetch_gmail_confirmation_url(url: str) -> None:
    timeout = httpx.Timeout(10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url)
            logger.info(
                "Gmail forwarding confirmation URL fetched: status=%s",
                response.status_code,
            )
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch Gmail forwarding confirmation URL: %s", exc)


@router.post("")
async def receive_inbound_email(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    form = await request.form()

    recipient_raw = str(form.get("recipient", "")).strip()
    sender = str(form.get("sender", "")).strip()
    subject = str(form.get("subject", "")).strip()
    body_plain = str(form.get("body-plain", "")).strip()
    body_html = str(form.get("body-html", "")).strip()
    message_id = str(
        form.get("Message-Id")
        or form.get("message-id")
        or form.get("message_id")
        or "",
    ).strip()
    timestamp = str(form.get("timestamp", "")).strip()
    token = str(form.get("token", "")).strip()
    signature = str(form.get("signature", "")).strip()

    if settings.ENV != "development":
        if not timestamp or not token or not signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid mailgun signature",
            )
        if not verify_mailgun_signature(timestamp=timestamp, token=token, signature=signature):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid mailgun signature",
            )

    recipient = _normalize_email_address(recipient_raw)
    if not recipient:
        return {"status": "ignored"}

    user_result = await db.execute(select(User).where(User.forwarding_email == recipient))
    user = user_result.scalar_one_or_none()
    if user is None:
        return {"status": "ignored"}

    if _is_gmail_forwarding_confirmation(subject):
        confirmation_url = _extract_gmail_confirmation_url(body_plain)
        if confirmation_url is not None:
            await _fetch_gmail_confirmation_url(confirmation_url)
        else:
            logger.warning(
                "Gmail forwarding confirmation email received without confirmation URL for user_id=%s",
                user.id,
            )
        return {"status": "ok"}

    if message_id:
        duplicate_result = await db.execute(
            select(Email.id).where(
                Email.user_id == user.id,
                Email.message_id == message_id,
            )
        )
        if duplicate_result.scalar_one_or_none() is not None:
            return {"status": "duplicate"}

    email_data = {
        "message_id": message_id,
        "subject": subject,
        "sender": sender,
        "body": body_plain or body_html,
        "received_at": datetime.now(UTC).isoformat(),
    }

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            partial(process_inbound_email_task.delay, str(user.id), email_data),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="inbound task enqueue failed",
        ) from exc

    return {"status": "queued"}
