from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import APIError
from app.core.security import get_current_user
from app.models.company import Company
from app.models.schedule import Schedule, ScheduleType
from app.models.user import User
from app.schemas.schedule import (
    ScheduleCreate,
    ScheduleResponse,
    ScheduleUpdate,
    UpcomingSchedulesResponse,
)

router = APIRouter()
JST = ZoneInfo("Asia/Tokyo")


@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    company_id: Annotated[UUID | None, Query()] = None,
    schedule_type: Annotated[ScheduleType | None, Query(alias="type")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ScheduleResponse]:
    if start_date is not None and end_date is not None and start_date > end_date:
        raise APIError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date は end_date 以前を指定してください",
            code="INVALID_DATE_RANGE",
        )

    stmt = (
        select(Schedule, Company.name)
        .outerjoin(
            Company,
            and_(Company.id == Schedule.company_id, Company.user_id == current_user.id),
        )
        .where(Schedule.user_id == current_user.id)
        .order_by(Schedule.start_at.asc())
        .offset(skip)
        .limit(limit)
    )

    if start_date is not None:
        start_dt = datetime.combine(start_date, time.min, tzinfo=UTC)
        stmt = stmt.where(Schedule.end_at >= start_dt)

    if end_date is not None:
        end_dt = datetime.combine(end_date, time.max, tzinfo=UTC)
        stmt = stmt.where(Schedule.start_at <= end_dt)

    if company_id is not None:
        stmt = stmt.where(Schedule.company_id == company_id)

    if schedule_type is not None:
        stmt = stmt.where(Schedule.type == schedule_type)

    rows = (await db.execute(stmt)).all()
    return [_build_schedule_response(schedule, company_name) for schedule, company_name in rows]


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduleResponse:
    company_name: str | None = None
    if payload.company_id is not None:
        company = await _get_owned_company(db, current_user.id, payload.company_id)
        if company is None:
            raise APIError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="企業が見つかりません",
                code="COMPANY_NOT_FOUND",
            )
        company_name = company.name

    start_at, end_at, is_all_day = _resolve_create_schedule_times(payload)
    schedule_data = payload.model_dump(
        exclude={
            "scheduled_at",
            "start_at",
            "end_at",
            "is_all_day",
        }
    )

    schedule = Schedule(
        user_id=current_user.id,
        start_at=start_at,
        end_at=end_at,
        is_all_day=is_all_day,
        scheduled_at=start_at,
        **schedule_data,
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)

    return _build_schedule_response(schedule, company_name)


@router.get("/upcoming", response_model=UpcomingSchedulesResponse)
async def get_upcoming_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UpcomingSchedulesResponse:
    now = datetime.now(UTC)
    until = now + timedelta(days=7)

    stmt = (
        select(Schedule, Company.name)
        .outerjoin(
            Company,
            and_(Company.id == Schedule.company_id, Company.user_id == current_user.id),
        )
        .where(
            Schedule.user_id == current_user.id,
            Schedule.end_at >= now,
            Schedule.start_at <= until,
        )
        .order_by(Schedule.start_at.asc())
    )
    rows = (await db.execute(stmt)).all()

    grouped = UpcomingSchedulesResponse()
    for schedule, company_name in rows:
        schedule_item = _build_schedule_response(schedule, company_name)
        getattr(grouped, schedule.type.value).append(schedule_item)

    return grouped


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: UUID,
    payload: ScheduleUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduleResponse:
    schedule = await _get_owned_schedule_or_raise(db, schedule_id, current_user.id)

    update_data = payload.model_dump(
        exclude_unset=True,
        exclude_none=True,
        exclude={"scheduled_at", "start_at", "end_at", "is_all_day"},
    )
    if "company_id" in update_data:
        company_id = update_data["company_id"]
        company = await _get_owned_company(db, current_user.id, company_id)
        if company is None:
            raise APIError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="企業が見つかりません",
                code="COMPANY_NOT_FOUND",
            )

    if _is_time_related_update(payload):
        start_at, end_at, is_all_day = _resolve_update_schedule_times(schedule=schedule, payload=payload)
        schedule.start_at = start_at
        schedule.end_at = end_at
        schedule.is_all_day = is_all_day
        schedule.scheduled_at = start_at

    for field, value in update_data.items():
        setattr(schedule, field, value)

    await db.flush()
    await db.refresh(schedule)

    company_name = await _get_company_name(db, current_user.id, schedule.company_id)
    return _build_schedule_response(schedule, company_name)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    schedule = await _get_owned_schedule_or_raise(db, schedule_id, current_user.id)
    await db.delete(schedule)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _build_schedule_response(schedule: Schedule, company_name: str | None) -> ScheduleResponse:
    response = ScheduleResponse.model_validate(schedule)
    return response.model_copy(update={"company_name": company_name, "scheduled_at": schedule.start_at})


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _is_time_related_update(payload: ScheduleUpdate) -> bool:
    return any(
        value is not None
        for value in (
            payload.start_at,
            payload.scheduled_at,
            payload.end_at,
            payload.is_all_day,
        )
    )


def _resolve_create_schedule_times(payload: ScheduleCreate) -> tuple[datetime, datetime, bool]:
    start_source = payload.start_at or payload.scheduled_at
    if start_source is None:
        raise APIError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_at または scheduled_at を指定してください",
            code="INVALID_SCHEDULE_TIME",
        )

    start_at = _normalize_datetime(start_source)
    _validate_start_is_not_past(start_at)

    if payload.is_all_day:
        return start_at, start_at + timedelta(days=1), True

    if payload.end_at is None and payload.scheduled_at is None:
        raise APIError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_at を指定してください",
            code="INVALID_SCHEDULE_TIME",
        )

    end_at = _normalize_datetime(payload.end_at) if payload.end_at is not None else start_at + timedelta(hours=1)
    _validate_time_range(start_at=start_at, end_at=end_at)
    return start_at, end_at, False


def _resolve_update_schedule_times(
    *,
    schedule: Schedule,
    payload: ScheduleUpdate,
) -> tuple[datetime, datetime, bool]:
    is_all_day = payload.is_all_day if payload.is_all_day is not None else schedule.is_all_day

    start_source = payload.start_at or payload.scheduled_at
    start_at = _normalize_datetime(start_source) if start_source is not None else schedule.start_at

    if start_source is not None or payload.is_all_day is not None:
        _validate_start_is_not_past(start_at)

    if is_all_day:
        return start_at, start_at + timedelta(days=1), True

    if payload.end_at is not None:
        end_at = _normalize_datetime(payload.end_at)
    elif (start_source is not None and payload.scheduled_at is not None) or (
        schedule.is_all_day and payload.is_all_day is False
    ):
        end_at = start_at + timedelta(hours=1)
    else:
        end_at = schedule.end_at

    _validate_time_range(start_at=start_at, end_at=end_at)
    return start_at, end_at, False


def _validate_start_is_not_past(start_at: datetime) -> None:
    if start_at < datetime.now(UTC):
        raise APIError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_at は現在以降を指定してください",
            code="INVALID_SCHEDULE_TIME",
        )


def _validate_time_range(*, start_at: datetime, end_at: datetime) -> None:
    if end_at <= start_at:
        raise APIError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_at は start_at より後を指定してください",
            code="INVALID_SCHEDULE_TIME",
        )

    if start_at.astimezone(JST).date() != end_at.astimezone(JST).date():
        raise APIError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="時間指定予定は同日内で設定してください",
            code="INVALID_SCHEDULE_TIME",
        )


async def _get_owned_company(
    db: AsyncSession,
    user_id: UUID,
    company_id: UUID,
) -> Company | None:
    stmt = select(Company).where(Company.id == company_id, Company.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_company_name(
    db: AsyncSession,
    user_id: UUID,
    company_id: UUID | None,
) -> str | None:
    if company_id is None:
        return None

    stmt = select(Company.name).where(Company.id == company_id, Company.user_id == user_id)
    return await db.scalar(stmt)


async def _get_owned_schedule_or_raise(
    db: AsyncSession,
    schedule_id: UUID,
    user_id: UUID,
) -> Schedule:
    owned_stmt = select(Schedule).where(Schedule.id == schedule_id, Schedule.user_id == user_id)
    owned_schedule = (await db.execute(owned_stmt)).scalar_one_or_none()
    if owned_schedule is not None:
        return owned_schedule

    others_stmt = select(Schedule.id).where(Schedule.id == schedule_id, Schedule.user_id != user_id)
    other_schedule_id = await db.scalar(others_stmt)
    if other_schedule_id is not None:
        raise APIError(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="他ユーザーのスケジュールにはアクセスできません",
            code="FORBIDDEN_SCHEDULE",
        )

    raise APIError(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="スケジュールが見つかりません",
        code="SCHEDULE_NOT_FOUND",
    )
