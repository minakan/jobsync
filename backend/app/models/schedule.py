from __future__ import annotations

from datetime import datetime, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.email import Email
    from app.models.user import User


class ScheduleType(StrEnum):
    ES_DEADLINE = "es_deadline"
    INTERVIEW = "interview"
    EXAM = "exam"
    EVENT = "event"
    WEBTEST = "webtest"
    OTHER = "other"


class Schedule(BaseModel):
    __tablename__ = "schedules"
    __table_args__ = (
        Index("ix_schedules_user_id_scheduled_at", "user_id", "scheduled_at"),
        Index("ix_schedules_user_id_start_at", "user_id", "start_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
    )
    type: Mapped[ScheduleType] = mapped_column(
        SAEnum(ScheduleType, name="schedule_type"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # legacy compatibility field (same value as start_at)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_all_day: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    online_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    reminder_1day: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    reminder_3day: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_email_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("emails.id", ondelete="SET NULL"),
        nullable=True,
    )

    user: Mapped[User] = relationship(back_populates="schedules")
    company: Mapped[Company | None] = relationship(back_populates="schedules")
    source_email: Mapped[Email | None] = relationship(back_populates="schedules")

    def __init__(self, **kwargs: object) -> None:
        # Backward-compatible construction for legacy callers that only pass scheduled_at.
        scheduled_at = kwargs.get("scheduled_at")
        start_at = kwargs.get("start_at")

        if start_at is None and isinstance(scheduled_at, datetime):
            kwargs["start_at"] = scheduled_at
            start_at = scheduled_at

        if kwargs.get("end_at") is None and isinstance(start_at, datetime):
            kwargs["end_at"] = start_at + timedelta(hours=1)

        if "is_all_day" not in kwargs:
            kwargs["is_all_day"] = False

        if kwargs.get("scheduled_at") is None and isinstance(start_at, datetime):
            kwargs["scheduled_at"] = start_at

        super().__init__(**kwargs)
