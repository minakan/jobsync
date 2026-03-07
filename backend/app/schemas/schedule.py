from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.schedule import ScheduleType


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class ScheduleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    type: ScheduleType
    scheduled_at: datetime
    company_id: UUID | None = None
    description: str | None = None
    location: str | None = None
    online_url: str | None = None
    reminder_1day: bool = False
    reminder_3day: bool = False

    @field_validator("scheduled_at")
    @classmethod
    def validate_scheduled_at(cls, value: datetime) -> datetime:
        normalized = _normalize_datetime(value)
        if normalized < datetime.now(UTC):
            raise ValueError("scheduled_at は現在以降を指定してください")
        return normalized


class ScheduleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    type: ScheduleType | None = None
    scheduled_at: datetime | None = None
    company_id: UUID | None = None
    description: str | None = None
    location: str | None = None
    online_url: str | None = None
    reminder_1day: bool | None = None
    reminder_3day: bool | None = None

    @field_validator("scheduled_at")
    @classmethod
    def validate_scheduled_at(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None

        normalized = _normalize_datetime(value)
        if normalized < datetime.now(UTC):
            raise ValueError("scheduled_at は現在以降を指定してください")
        return normalized


class ScheduleResponse(BaseModel):
    id: UUID
    user_id: UUID
    company_id: UUID | None
    type: ScheduleType
    title: str
    description: str | None
    scheduled_at: datetime
    location: str | None
    online_url: str | None
    reminder_1day: bool
    reminder_3day: bool
    reminder_sent_at: datetime | None
    source_email_id: UUID | None
    created_at: datetime
    updated_at: datetime
    company_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UpcomingSchedulesResponse(BaseModel):
    es_deadline: list[ScheduleResponse] = Field(default_factory=list)
    interview: list[ScheduleResponse] = Field(default_factory=list)
    exam: list[ScheduleResponse] = Field(default_factory=list)
    event: list[ScheduleResponse] = Field(default_factory=list)
    webtest: list[ScheduleResponse] = Field(default_factory=list)
    other: list[ScheduleResponse] = Field(default_factory=list)
