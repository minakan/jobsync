import os
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import APIError

# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict[str, Any]) -> str:
    """15分有効なアクセストークンを生成する"""
    payload = data.copy()
    payload["exp"] = datetime.now(UTC) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload["type"] = "access"
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """30日有効なリフレッシュトークンを生成する"""
    payload = {
        "sub": user_id,
        "exp": datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str, token_type: str = "access") -> dict[str, Any]:
    """
    JWTを検証してペイロードを返す。
    失敗した場合は HTTPException(401) を送出する。
    """
    credentials_exception = APIError(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="認証情報が無効です",
        code="UNAUTHORIZED",
    )
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != token_type:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception from None


# ── AES-256-GCM 暗号化 ────────────────────────────────────────────────────────

def _get_aes_key() -> bytes:
    return bytes.fromhex(settings.ENCRYPTION_KEY)


def encrypt_token(plain_text: str) -> str:
    """
    平文文字列を AES-256-GCM で暗号化し、"nonce:ciphertext" 形式の hex 文字列を返す。
    DBに保存するトークン類（OAuth access_token / refresh_token）に使用する。
    """
    key = _get_aes_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce（GCM推奨）
    ciphertext = aesgcm.encrypt(nonce, plain_text.encode(), None)
    return f"{nonce.hex()}:{ciphertext.hex()}"


def decrypt_token(encrypted_text: str) -> str:
    """
    "nonce:ciphertext" 形式の hex 文字列を復号して平文を返す。
    """
    try:
        nonce_hex, ct_hex = encrypted_text.split(":", 1)
        key = _get_aes_key()
        aesgcm = AESGCM(key)
        plain = aesgcm.decrypt(bytes.fromhex(nonce_hex), bytes.fromhex(ct_hex), None)
        return plain.decode()
    except Exception as e:
        raise ValueError(f"トークン復号に失敗しました: {e}") from e


# ── FastAPI Depends: 現在のユーザーを取得 ─────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Any:
    """
    Authorization: Bearer <JWT> ヘッダーからユーザーを解決して返す。
    モデルは models.user がロードされた後に import するため、
    ここでは遅延インポートを使用する。
    """
    from sqlalchemy import select

    from app.models.user import User  # 遅延インポート（循環依存回避）

    if credentials is None:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="認証情報が必要です",
            code="UNAUTHORIZED",
        )

    payload = verify_token(credentials.credentials)
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="トークンにユーザーIDが含まれていません",
            code="INVALID_TOKEN",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザーが見つかりません",
            code="USER_NOT_FOUND",
        )
    return user
