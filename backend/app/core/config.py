from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://jobsync:password@localhost:5432/jobsync_dev"

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── OpenAI ───────────────────────────────────────────────
    OPENAI_API_KEY: str = ""

    # ── Google OAuth2 ─────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/emails/connect/gmail/callback"

    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── AES-256-GCM 暗号化キー（32バイトの hex 文字列 = 64文字）─
    ENCRYPTION_KEY: str = "0" * 64

    # ── Application ───────────────────────────────────────────
    ENV: Literal["development", "staging", "production"] = "development"
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "exp://localhost:8081",
    ]

    # ── Firebase（プッシュ通知）────────────────────────────────
    FIREBASE_CREDENTIALS_JSON: str = "{}"

    # ── Monitoring（オプション）────────────────────────────────
    SENTRY_DSN: str = ""

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if len(v) != 64:
            raise ValueError("ENCRYPTION_KEY は 64文字の16進数文字列（32バイト）である必要があります")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
