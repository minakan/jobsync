from __future__ import annotations

import hashlib
import hmac

from app.core.config import settings
from app.core.mailgun import verify_mailgun_signature


def test_verify_mailgun_signature_true(monkeypatch) -> None:
    monkeypatch.setattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "test-signing-key")
    timestamp = "1700000000"
    token = "mailgun-token"
    signature = hmac.new(
        b"test-signing-key",
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()

    assert verify_mailgun_signature(timestamp=timestamp, token=token, signature=signature) is True


def test_verify_mailgun_signature_false(monkeypatch) -> None:
    monkeypatch.setattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "test-signing-key")

    assert (
        verify_mailgun_signature(
            timestamp="1700000000",
            token="mailgun-token",
            signature="invalid-signature",
        )
        is False
    )
