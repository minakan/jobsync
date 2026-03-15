from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.company import CompanyStatus
from app.models.schedule import ScheduleType


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    industry: str | None = None
    status: CompanyStatus = CompanyStatus.INTERESTED
    priority: int = Field(default=3, ge=1, le=5)
    notes: str | None = None


class CompanyUpdate(BaseModel):
    status: CompanyStatus | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None


class CompanyScheduleResponse(BaseModel):
    id: UUID
    user_id: UUID
    company_id: UUID | None
    type: ScheduleType
    title: str
    start_at: datetime
    end_at: datetime
    is_all_day: bool
    # legacy compatibility field
    scheduled_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CompanyResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    industry: str | None
    website_url: str | None
    status: CompanyStatus
    priority: int
    notes: str | None
    status_history: list[dict[str, str]]
    created_at: datetime
    updated_at: datetime
    schedules: list[CompanyScheduleResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CompanyStats(BaseModel):
    status_counts: dict[str, int]
    total: int
    applied_count: int
    offered_count: int
    pass_rate: float
