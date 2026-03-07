import base64
from urllib.parse import parse_qs, urlparse

from app.services.gmail_service import GmailService


def _encode_base64url(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("utf-8").rstrip("=")


def test_get_oauth_url_uses_gmail_readonly_scope() -> None:
    service = GmailService()

    oauth_url = service.get_oauth_url("state-123")

    parsed = urlparse(oauth_url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "accounts.google.com"
    assert query["scope"] == ["https://www.googleapis.com/auth/gmail.readonly"]
    assert query["state"] == ["state-123"]
    assert query["access_type"] == ["offline"]


def test_decode_email_body_prefers_plain_text() -> None:
    service = GmailService()
    payload = {
        "mimeType": "multipart/alternative",
        "parts": [
            {
                "mimeType": "text/html",
                "body": {"data": _encode_base64url("<p>Hello HTML</p>")},
            },
            {
                "mimeType": "text/plain",
                "body": {"data": _encode_base64url("Hello Plain")},
            },
        ],
    }

    body = service._decode_email_body(payload)

    assert body == "Hello Plain"


def test_decode_email_body_falls_back_to_html() -> None:
    service = GmailService()
    payload = {
        "mimeType": "multipart/alternative",
        "parts": [
            {
                "mimeType": "text/html",
                "body": {"data": _encode_base64url("<p>Only HTML</p>")},
            }
        ],
    }

    body = service._decode_email_body(payload)

    assert body == "<p>Only HTML</p>"
