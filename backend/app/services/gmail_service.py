from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.logger import logger


class GmailServiceError(RuntimeError):
    """Raised when Gmail API interactions fail."""


class GmailService:
    SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

    _AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    _TOKEN_URL = "https://oauth2.googleapis.com/token"
    _GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me"

    def get_oauth_url(self, state: str) -> str:
        """Google OAuth2認証URLを生成する（CSRF対策にstate使用）"""
        query = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(self.SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{self._AUTH_URL}?{urlencode(query)}"

    async def exchange_code_for_tokens(self, code: str) -> dict[str, str]:
        """認証コードをaccess_token/refresh_tokenに交換する"""
        payload = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(self._TOKEN_URL, data=payload)

        if response.is_error:
            logger.error("Failed to exchange code for Gmail tokens: status=%s", response.status_code)
            raise GmailServiceError("Failed to exchange code for Gmail tokens")

        token_data = response.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)

        if not isinstance(access_token, str) or not access_token:
            raise GmailServiceError("Gmail access_token is missing in token exchange response")
        if not isinstance(refresh_token, str):
            raise GmailServiceError("Gmail refresh_token has invalid type")

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": str(expires_in),
        }

    async def get_recent_emails(
        self,
        access_token: str,
        refresh_token: str,
        days_back: int = 30,
        max_results: int = 100,
    ) -> list[dict]:
        """直近days_back日のメールを取得する（nextPageTokenでページネーション）"""
        after_timestamp = int((datetime.now(UTC) - timedelta(days=days_back)).timestamp())

        messages: list[dict[str, Any]] = []
        page_token: str | None = None
        active_access_token = access_token
        refreshed = False

        async with httpx.AsyncClient(timeout=20.0) as client:
            while len(messages) < max_results:
                request_params: dict[str, Any] = {
                    "q": f"after:{after_timestamp}",
                    "maxResults": min(100, max_results - len(messages)),
                }
                if page_token:
                    request_params["pageToken"] = page_token

                response = await client.get(
                    f"{self._GMAIL_BASE_URL}/messages",
                    headers={"Authorization": f"Bearer {active_access_token}"},
                    params=request_params,
                )

                if response.status_code == 401 and not refreshed:
                    active_access_token, _ = await self.refresh_access_token(refresh_token)
                    refreshed = True
                    page_token = None
                    continue
                if response.is_error:
                    logger.error(
                        "Failed to fetch Gmail message list: status=%s",
                        response.status_code,
                    )
                    raise GmailServiceError("Failed to fetch Gmail message list")

                data = response.json()
                page_messages = data.get("messages", [])
                if isinstance(page_messages, list):
                    for item in page_messages:
                        if isinstance(item, dict):
                            messages.append(item)

                if len(messages) >= max_results:
                    break

                next_page_token = data.get("nextPageToken")
                if not isinstance(next_page_token, str) or not next_page_token:
                    break
                page_token = next_page_token

        return messages[:max_results]

    async def get_email_detail(self, access_token: str, message_id: str) -> dict:
        """メール詳細（件名・本文・送信者）を取得する（Base64urlデコード、multipart対応）"""
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{self._GMAIL_BASE_URL}/messages/{message_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"format": "full"},
            )

        if response.is_error:
            logger.error(
                "Failed to fetch Gmail message detail: status=%s message_id=%s",
                response.status_code,
                message_id,
            )
            raise GmailServiceError("Failed to fetch Gmail message detail")

        message_data = response.json()
        payload = message_data.get("payload", {})
        headers = payload.get("headers", [])
        header_map = self._headers_to_map(headers)

        return {
            "id": message_data.get("id", message_id),
            "thread_id": message_data.get("threadId", ""),
            "subject": header_map.get("subject", ""),
            "from": header_map.get("from", ""),
            "date": header_map.get("date", ""),
            "internal_date": message_data.get("internalDate", ""),
            "body": self._decode_email_body(payload),
        }

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, datetime]:
        """アクセストークンをリフレッシュする"""
        payload = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(self._TOKEN_URL, data=payload)

        if response.is_error:
            logger.error("Failed to refresh Gmail access token: status=%s", response.status_code)
            raise GmailServiceError("Failed to refresh Gmail access token")

        token_data = response.json()
        access_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in", 3600)

        if not isinstance(access_token, str) or not access_token:
            raise GmailServiceError("Gmail access_token is missing in refresh response")

        expires_in_int = int(expires_in) if isinstance(expires_in, int | str) else 3600
        expires_at = datetime.now(UTC) + timedelta(seconds=expires_in_int)
        return access_token, expires_at

    def _decode_email_body(self, payload: dict) -> str:
        """Gmail API payloadからテキスト本文を抽出（text/plain優先）"""
        plain_text_parts: list[str] = []
        html_parts: list[str] = []

        def walk(part: dict[str, Any]) -> None:
            mime_type = str(part.get("mimeType", ""))
            body = part.get("body", {})
            data = body.get("data") if isinstance(body, dict) else None

            if isinstance(data, str) and data:
                decoded = self._decode_base64url(data)
                if mime_type.startswith("text/plain"):
                    plain_text_parts.append(decoded)
                elif mime_type.startswith("text/html"):
                    html_parts.append(decoded)
                elif not mime_type:
                    # 単一パートの本文（mimeTypeが空のケース）
                    plain_text_parts.append(decoded)

            nested_parts = part.get("parts", [])
            if isinstance(nested_parts, list):
                for child in nested_parts:
                    if isinstance(child, dict):
                        walk(child)

        walk(payload)

        if plain_text_parts:
            return "\n".join(piece for piece in plain_text_parts if piece).strip()
        if html_parts:
            return "\n".join(piece for piece in html_parts if piece).strip()
        return ""

    @staticmethod
    def _decode_base64url(data: str) -> str:
        padding = "=" * (-len(data) % 4)
        decoded = base64.urlsafe_b64decode(data + padding)
        return decoded.decode("utf-8", errors="replace")

    @staticmethod
    def _headers_to_map(headers: Any) -> dict[str, str]:
        header_map: dict[str, str] = {}
        if not isinstance(headers, list):
            return header_map

        for header in headers:
            if not isinstance(header, dict):
                continue
            name = header.get("name")
            value = header.get("value")
            if isinstance(name, str) and isinstance(value, str):
                header_map[name.lower()] = value
        return header_map
