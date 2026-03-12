from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Annotated
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decrypt_token, encrypt_token, get_current_user
from app.models.email import Email
from app.models.email_connection import EmailConnection, EmailProvider
from app.models.user import User
from app.schemas.email import (
    EmailListItem,
    EmailListResponse,
    EmailSyncResponse,
    GmailConnectResponse,
)
from app.services.gmail_service import GmailService, GmailServiceError
from app.tasks.email_sync_task import sync_emails_task

router = APIRouter()
gmail_service = GmailService()

STATE_TTL_SECONDS = 600
STATE_KEY_PREFIX = "gmail:oauth:state"


@router.post("/connect/gmail", response_model=GmailConnectResponse)
async def connect_gmail(
    current_user: Annotated[User, Depends(get_current_user)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> GmailConnectResponse:
    state = secrets.token_urlsafe(32)
    state_key = f"{STATE_KEY_PREFIX}:{state}"

    await redis.setex(state_key, STATE_TTL_SECONDS, str(current_user.id))
    oauth_url = gmail_service.get_oauth_url(state)
    return GmailConnectResponse(oauth_url=oauth_url, state=state)


@router.get("/connect/gmail/callback")
async def connect_gmail_callback(
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
    code: str = Query(..., min_length=1),
    state: str = Query(..., min_length=1),
) -> RedirectResponse:
    try:
        state_key = f"{STATE_KEY_PREFIX}:{state}"
        user_id_raw = await redis.get(state_key)

        if not isinstance(user_id_raw, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="state が無効または期限切れです",
            )

        await redis.delete(state_key)

        try:
            user_id = UUID(user_id_raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="state に紐づくユーザーIDが不正です",
            ) from exc

        try:
            tokens = await gmail_service.exchange_code_for_tokens(code)
        except GmailServiceError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google OAuthトークン交換に失敗しました",
            ) from exc

        access_token = tokens.get("access_token", "")
        refresh_token_from_google = tokens.get("refresh_token", "")
        expires_in_raw = tokens.get("expires_in", "3600")

        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Googleからaccess_tokenを取得できませんでした",
            )

        stmt = select(EmailConnection).where(
            EmailConnection.user_id == user_id,
            EmailConnection.provider == EmailProvider.GMAIL,
        )
        result = await db.execute(stmt)
        connection = result.scalar_one_or_none()

        refresh_token = refresh_token_from_google
        if not refresh_token and connection is not None:
            try:
                refresh_token = decrypt_token(connection.refresh_token)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="保存済みrefresh_tokenの復号に失敗しました",
                ) from exc

        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Googleからrefresh_tokenを取得できませんでした",
            )

        try:
            expires_in = int(expires_in_raw)
        except ValueError:
            expires_in = 3600
        token_expiry = datetime.now(UTC) + timedelta(seconds=expires_in)

        encrypted_access_token = encrypt_token(access_token)
        encrypted_refresh_token = encrypt_token(refresh_token)

        if connection is None:
            connection = EmailConnection(
                user_id=user_id,
                provider=EmailProvider.GMAIL,
                access_token=encrypted_access_token,
                refresh_token=encrypted_refresh_token,
                token_expiry=token_expiry,
                last_synced_at=None,
            )
            db.add(connection)
        else:
            connection.access_token = encrypted_access_token
            connection.refresh_token = encrypted_refresh_token
            connection.token_expiry = token_expiry

        await db.flush()

        try:
            loop = asyncio.get_event_loop()
            task_result = await loop.run_in_executor(
                None, partial(sync_emails_task.delay, str(user_id))
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="同期タスクの投入に失敗しました",
            ) from exc

        return _build_gmail_callback_redirect(status_value="connected", task_id=task_result.id)
    except HTTPException as exc:
        message = exc.detail if isinstance(exc.detail, str) else "Gmail連携に失敗しました"
        return _build_gmail_callback_redirect(status_value="error", message=message)


@router.post("/sync", response_model=EmailSyncResponse)
async def sync_emails(
    current_user: Annotated[User, Depends(get_current_user)],
) -> EmailSyncResponse:
    try:
        loop = asyncio.get_event_loop()
        task_result = await loop.run_in_executor(
            None, partial(sync_emails_task.delay, str(current_user.id))
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="同期タスクの投入に失敗しました",
        ) from exc

    return EmailSyncResponse(task_id=task_result.id, status="queued")


@router.get("", response_model=EmailListResponse)
async def list_emails(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> EmailListResponse:
    stmt = (
        select(Email)
        .where(Email.user_id == current_user.id, Email.processed_at.is_not(None))
        .order_by(Email.received_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)

    items: list[EmailListItem] = []
    for email_row in result.scalars().all():
        parsed_data = email_row.parsed_data if isinstance(email_row.parsed_data, dict) else {}
        company_name = _extract_company_name(parsed_data)

        sender_email = email_row.sender_email or ""
        sender_display = email_row.sender_name or sender_email

        items.append(
            EmailListItem(
                id=str(email_row.id),
                message_id=email_row.gmail_message_id,
                subject=email_row.subject or "",
                sender=sender_display,
                sender_email=sender_email,
                received_at=email_row.received_at,
                company_name=company_name,
            )
        )

    return EmailListResponse(items=items)


def _extract_company_name(parsed_data: dict[str, object]) -> str | None:
    company_name = parsed_data.get("company_name")
    if isinstance(company_name, str) and company_name:
        return company_name

    company_info = parsed_data.get("company_info")
    if isinstance(company_info, dict):
        info_name = company_info.get("name")
        if isinstance(info_name, str) and info_name:
            return info_name

    return None


def _build_gmail_callback_redirect(
    *,
    status_value: str,
    task_id: str | None = None,
    message: str | None = None,
) -> RedirectResponse:
    params: dict[str, str] = {"status": status_value}
    if task_id:
        params["task_id"] = task_id
    if message:
        params["message"] = message

    redirect_url = f"jobsync://emails/callback?{urlencode(params)}"
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
