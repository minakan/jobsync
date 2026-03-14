from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from app.core.config import settings


def build_mailgun_payload(
    recipient: str,
    sender: str = "test@example.com",
    subject: str = "一次面接のご案内",
    body_plain: str = "一次面接の日程をご案内します。",
    timestamp: str | None = None,
) -> dict[str, str]:
    """Mailgun inbound webhookのリクエストボディを生成する"""
    resolved_timestamp = timestamp if timestamp is not None else str(int(time.time()))
    token = secrets.token_hex(16)
    signature = hmac.new(
        settings.MAILGUN_WEBHOOK_SIGNING_KEY.encode(),
        f"{resolved_timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()

    return {
        "recipient": recipient,
        "sender": sender,
        "subject": subject,
        "body-plain": body_plain,
        "Message-Id": f"<{token}@example.com>",
        "timestamp": resolved_timestamp,
        "token": token,
        "signature": signature,
    }

