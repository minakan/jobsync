import hashlib
import hmac

from app.core.config import settings


def verify_mailgun_signature(timestamp: str, token: str, signature: str) -> bool:
    """Mailgunのwebhookシグネチャを検証"""
    value = f"{timestamp}{token}".encode()
    key = settings.MAILGUN_WEBHOOK_SIGNING_KEY.encode()
    digest = hmac.new(key, value, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)
