"""
認証エンドポイント — Google OAuth2 ログイン / トークンリフレッシュ / ログアウト

フロー:
  1. Mobile が GET /auth/google/login を叩く → Google OAuthのURLを返す
  2. expo-web-browser でそのURLを開く
  3. ユーザーがGoogleでログイン → GET /auth/google/callback にリダイレクト
  4. バックエンドがユーザーを作成/更新し、JWTを発行
  5. deep link (jobsync://auth/callback?access_token=...&refresh_token=...) でアプリに戻る
"""

from __future__ import annotations

import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import APIError
from app.core.logger import logger
from app.core.redis import get_redis
from app.core.security import create_access_token, create_refresh_token, get_current_user, verify_token

router = APIRouter()

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_AUTH_SCOPES = ["openid", "email", "profile"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserInfo(BaseModel):
    id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/google/login", summary="Google OAuth2 認証URLを取得")
async def google_login(redis=Depends(get_redis)) -> dict[str, str]:
    """
    Google OAuth2 の認証URLを返す。
    クライアントはこのURLをブラウザで開いてユーザーに認証させる。
    """
    state = secrets.token_urlsafe(32)
    await redis.setex(f"auth:state:{state}", 600, "1")  # 10分有効

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.AUTH_GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(_AUTH_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    url = f"{_GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"url": url}


@router.get("/google/callback", summary="Google OAuthコールバック（Googleからのリダイレクト先）")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    redis=Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """
    Googleからのコールバック。
    ユーザーを作成/更新してJWTを発行し、アプリのdeep linkへリダイレクトする。
    """
    from app.models.user import User  # 遅延インポート（循環依存回避）

    # ── state検証（CSRF対策）────────────────────────────────────────────────
    state_key = f"auth:state:{state}"
    if not await redis.get(state_key):
        raise APIError(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無効なstateパラメータです（セッションが期限切れか改ざんされています）",
            code="INVALID_STATE",
        )
    await redis.delete(state_key)

    # ── Googleからアクセストークン取得 ───────────────────────────────────────
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.AUTH_GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )

    if token_resp.is_error:
        logger.error("Google token exchange failed: %s %s", token_resp.status_code, token_resp.text)
        raise APIError(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google認証に失敗しました",
            code="GOOGLE_AUTH_FAILED",
        )

    google_access_token: str = token_resp.json().get("access_token", "")
    if not google_access_token:
        raise APIError(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Googleからアクセストークンが取得できませんでした",
            code="GOOGLE_NO_TOKEN",
        )

    # ── Googleユーザー情報取得 ───────────────────────────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        userinfo_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )

    if userinfo_resp.is_error:
        logger.error("Google userinfo fetch failed: %s", userinfo_resp.status_code)
        raise APIError(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Googleユーザー情報の取得に失敗しました",
            code="USERINFO_FAILED",
        )

    info: dict[str, Any] = userinfo_resp.json()
    email: str = info.get("email", "")
    name: str = info.get("name", "")
    avatar_url: str = info.get("picture", "")

    if not email:
        raise APIError(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Googleアカウントのメールアドレスが取得できませんでした",
            code="NO_EMAIL",
        )

    # ── DB: ユーザー作成 or 更新 ─────────────────────────────────────────────
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email, name=name, avatar_url=avatar_url)
        db.add(user)
        await db.flush()
        logger.info("New user created: email=%s", email)
    else:
        user.name = name
        user.avatar_url = avatar_url
        logger.info("User updated: email=%s", email)

    await db.commit()
    await db.refresh(user)

    # ── JWT発行 ──────────────────────────────────────────────────────────────
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token(str(user.id))

    # ── モバイルアプリへdeep linkリダイレクト ────────────────────────────────
    deep_link = (
        f"jobsync://auth/callback"
        f"?access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&user_id={user.id}"
        f"&email={user.email}"
        f"&name={user.name or ''}"
    )
    return RedirectResponse(url=deep_link, status_code=302)


@router.post("/refresh", response_model=TokenResponse, summary="アクセストークンをリフレッシュ")
async def refresh_token(body: RefreshRequest) -> TokenResponse:
    """
    リフレッシュトークンで新しいアクセストークンとリフレッシュトークンを発行する。
    （リフレッシュトークンのローテーション）
    """
    payload = verify_token(body.refresh_token, token_type="refresh")
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無効なリフレッシュトークンです",
            code="INVALID_TOKEN",
        )

    new_access_token = create_access_token({"sub": user_id})
    new_refresh_token = create_refresh_token(user_id)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="ログアウト")
async def logout() -> None:
    """
    ログアウト。JWTはステートレスなのでサーバー側での無効化は行わない。
    クライアントはローカルのトークンを削除すること。
    """
    return None


@router.get("/me", response_model=UserInfo, summary="現在のユーザー情報を取得")
async def get_me(current_user: Any = Depends(get_current_user)) -> UserInfo:
    """認証済みユーザーのプロフィールを返す"""
    return UserInfo(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        avatar_url=current_user.avatar_url,
    )
