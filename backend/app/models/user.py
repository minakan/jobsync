from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.email import Email
    from app.models.email_connection import EmailConnection
    from app.models.schedule import Schedule


class User(BaseModel):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    forwarding_email: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    university: Mapped[str | None] = mapped_column(String(255), nullable=True)
    graduation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    premium_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    email_connections: Mapped[list[EmailConnection]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    companies: Mapped[list[Company]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    schedules: Mapped[list[Schedule]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    emails: Mapped[list[Email]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
