from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.logger import logger
from app.models.schedule import Schedule
from app.models.user import User
from app.services.notification_service import NotificationService
from app.tasks.celery_app import celery_app

JST = ZoneInfo("Asia/Tokyo")


@celery_app.task
def send_daily_reminders() -> dict[str, int]:
    """
    毎日実行。以下の対象スケジュールにリマインダーを送信:
    - reminder_1day=True かつ start_at が明日(JST) かつ reminder_sent_at IS NULL
    - reminder_3day=True かつ start_at が3日後(JST) かつ reminder_sent_at IS NULL
    送信後: schedule.reminder_sent_at = now() を更新（重複送信防止）
    asyncio.run()でDB操作を実行
    戻り値: {"sent": n, "failed": m}
    """
    return asyncio.run(_send_daily_reminders())


async def _send_daily_reminders() -> dict[str, int]:
    notification_service = NotificationService()
    sent = 0
    failed = 0
    now_utc = datetime.now(UTC)
    today_jst = now_utc.astimezone(JST).date()

    async with AsyncSessionLocal() as session:
        for days_before in (1, 3):
            targets = await _load_reminder_targets(
                session=session,
                base_date_jst=today_jst,
                days_before=days_before,
            )

            for schedule, fcm_token in targets:
                try:
                    is_sent = await notification_service.send_schedule_reminder(
                        fcm_token=fcm_token,
                        schedule=schedule,
                        days_before=days_before,
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Unexpected error while sending reminder. schedule_id=%s days_before=%s",
                        schedule.id,
                        days_before,
                    )
                    is_sent = False

                if is_sent:
                    schedule.reminder_sent_at = now_utc
                    sent += 1
                else:
                    failed += 1

        await session.commit()

    return {"sent": sent, "failed": failed}


async def _load_reminder_targets(
    session: AsyncSession,
    base_date_jst: date,
    days_before: int,
) -> list[tuple[Schedule, str]]:
    start_utc, end_utc = _get_utc_day_range(base_date_jst=base_date_jst, days_before=days_before)
    flag_column = Schedule.reminder_1day if days_before == 1 else Schedule.reminder_3day

    stmt = (
        select(Schedule, User.fcm_token)
        .join(User, User.id == Schedule.user_id)
        .options(selectinload(Schedule.company))
        .where(
            flag_column.is_(True),
            Schedule.reminder_sent_at.is_(None),
            Schedule.start_at >= start_utc,
            Schedule.start_at < end_utc,
            User.fcm_token.is_not(None),
            User.fcm_token != "",
        )
    )
    result = await session.execute(stmt)

    targets: list[tuple[Schedule, str]] = []
    for schedule, fcm_token in result.all():
        if isinstance(fcm_token, str) and fcm_token.strip():
            targets.append((schedule, fcm_token))

    return targets


def _get_utc_day_range(base_date_jst: date, days_before: int) -> tuple[datetime, datetime]:
    target_date_jst = base_date_jst + timedelta(days=days_before)
    day_start_jst = datetime.combine(target_date_jst, time.min, tzinfo=JST)
    day_end_jst = day_start_jst + timedelta(days=1)
    return day_start_jst.astimezone(UTC), day_end_jst.astimezone(UTC)
