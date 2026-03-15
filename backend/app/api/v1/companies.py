from __future__ import annotations

import unicodedata
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.errors import APIError
from app.core.security import get_current_user
from app.models.company import Company, CompanyStatus
from app.models.user import User
from app.schemas.company import CompanyCreate, CompanyResponse, CompanyStats, CompanyUpdate

router = APIRouter()


@router.get("", response_model=list[CompanyResponse])
async def list_companies(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filters: Annotated[list[CompanyStatus] | None, Query(alias="status")] = None,
    priority_gte: int | None = Query(default=None, ge=1, le=5),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[CompanyResponse]:
    stmt = (
        select(Company)
        .options(selectinload(Company.schedules))
        .where(Company.user_id == current_user.id)
        .order_by(Company.priority.desc(), Company.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    if status_filters:
        stmt = stmt.where(Company.status.in_(status_filters))

    if priority_gte is not None:
        stmt = stmt.where(Company.priority >= priority_gte)

    companies = (await db.execute(stmt)).scalars().all()
    return [_build_company_response(company) for company in companies]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CompanyResponse:
    if await _is_duplicate_company_name(db, current_user.id, payload.name):
        raise APIError(
            status_code=status.HTTP_409_CONFLICT,
            detail="同名の企業が既に登録されています",
            code="DUPLICATE_COMPANY",
        )

    company = Company(
        user_id=current_user.id,
        name=payload.name.strip(),
        industry=payload.industry,
        status=payload.status,
        priority=payload.priority,
        notes=payload.notes,
    )
    db.add(company)
    await db.flush()
    await db.refresh(company)
    return _build_company_response(company)


@router.get("/stats", response_model=CompanyStats)
async def get_company_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CompanyStats:
    stmt = (
        select(Company.status, func.count(Company.id))
        .where(Company.user_id == current_user.id)
        .group_by(Company.status)
    )
    rows = (await db.execute(stmt)).all()

    status_counts = {company_status.value: 0 for company_status in CompanyStatus}
    for company_status, count in rows:
        status_counts[company_status.value] = int(count)

    total = sum(status_counts.values())
    applied_count = status_counts[CompanyStatus.APPLIED.value]
    offered_count = status_counts[CompanyStatus.OFFERED.value]
    pass_rate = float(offered_count / applied_count) if applied_count > 0 else 0.0

    return CompanyStats(
        status_counts=status_counts,
        total=total,
        applied_count=applied_count,
        offered_count=offered_count,
        pass_rate=pass_rate,
    )


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: UUID,
    payload: CompanyUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CompanyResponse:
    company = await _get_owned_company_or_raise(db, company_id, current_user.id)
    update_data = payload.model_dump(exclude_unset=True, exclude_none=True)

    new_status = update_data.pop("status", None)
    if isinstance(new_status, CompanyStatus) and new_status != company.status:
        history = list(company.status_history or [])
        history.append(
            {
                "from": company.status.value,
                "to": new_status.value,
                "changed_at": datetime.now(UTC).isoformat(),
            }
        )
        company.status_history = history
        company.status = new_status

    for field, value in update_data.items():
        setattr(company, field, value)

    await db.flush()
    await db.refresh(company)
    return _build_company_response(company)


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    company = await _get_owned_company_or_raise(db, company_id, current_user.id)
    await db.delete(company)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _build_company_response(company: Company) -> CompanyResponse:
    response = CompanyResponse.model_validate(company)
    sorted_schedules = sorted(response.schedules, key=lambda row: row.start_at)
    return response.model_copy(update={"schedules": sorted_schedules})


def _normalize_company_name(name: str) -> str:
    return unicodedata.normalize("NFKC", name).casefold().strip()


async def _is_duplicate_company_name(
    db: AsyncSession,
    user_id: UUID,
    name: str,
) -> bool:
    target = _normalize_company_name(name)
    stmt = select(Company.name).where(Company.user_id == user_id)
    existing_names = (await db.execute(stmt)).scalars().all()
    return any(_normalize_company_name(existing_name) == target for existing_name in existing_names)


async def _get_owned_company_or_raise(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
) -> Company:
    owned_stmt = (
        select(Company)
        .options(selectinload(Company.schedules))
        .where(Company.id == company_id, Company.user_id == user_id)
    )
    owned_company = (await db.execute(owned_stmt)).scalar_one_or_none()
    if owned_company is not None:
        return owned_company

    others_stmt = select(Company.id).where(Company.id == company_id, Company.user_id != user_id)
    other_company_id = await db.scalar(others_stmt)
    if other_company_id is not None:
        raise APIError(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="他ユーザーの企業にはアクセスできません",
            code="FORBIDDEN_COMPANY",
        )

    raise APIError(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="企業が見つかりません",
        code="COMPANY_NOT_FOUND",
    )
