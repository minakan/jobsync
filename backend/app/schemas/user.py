from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserFcmTokenUpdate(BaseModel):
    fcm_token: str = Field(..., min_length=1, max_length=512)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str | None
    university: str | None
    graduation_year: int | None
    premium_until: datetime | None
    created_at: datetime
