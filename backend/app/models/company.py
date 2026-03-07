from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.schedule import Schedule
    from app.models.user import User


class CompanyStatus(StrEnum):
    INTERESTED = "interested"
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW1 = "interview1"
    INTERVIEW2 = "interview2"
    FINAL = "final"
    OFFERED = "offered"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Company(BaseModel):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint("priority >= 1 AND priority <= 5", name="ck_companies_priority_range"),
        Index("ix_companies_user_id_status", "user_id", "status"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status: Mapped[CompanyStatus] = mapped_column(
        SAEnum(CompanyStatus, name="company_status"),
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(nullable=False, default=3)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="companies")
    schedules: Mapped[list[Schedule]] = relationship(back_populates="company")
