from __future__ import annotations

from datetime import UTC, datetime
from types import MethodType
from uuid import uuid4

import pytest

from app.models.schedule import Schedule, ScheduleType
from app.services.notification_service import NotificationService


def _build_schedule(*, schedule_type: ScheduleType, scheduled_at: datetime) -> Schedule:
    return Schedule(
        id=uuid4(),
        user_id=uuid4(),
        type=schedule_type,
        title="テスト予定",
        scheduled_at=scheduled_at,
    )


@pytest.mark.anyio
async def test_send_push_returns_false_when_token_is_empty() -> None:
    service = NotificationService()

    result = await service.send_push(
        fcm_token="  ",
        title="title",
        body="body",
    )

    assert result is False


@pytest.mark.anyio
async def test_send_schedule_reminder_for_es_3days() -> None:
    service = NotificationService()
    schedule = _build_schedule(
        schedule_type=ScheduleType.ES_DEADLINE,
        scheduled_at=datetime(2026, 3, 10, 14, 0, tzinfo=UTC),
    )
    captured: dict[str, object] = {}

    async def fake_send_push(
        self: NotificationService,
        fcm_token: str,
        title: str,
        body: str,
        data: dict[str, str] | None = None,
    ) -> bool:
        captured["token"] = fcm_token
        captured["title"] = title
        captured["body"] = body
        captured["data"] = data
        return True

    service.send_push = MethodType(fake_send_push, service)

    result = await service.send_schedule_reminder(
        fcm_token="fcm-token",
        schedule=schedule,
        days_before=3,
    )

    assert result is True
    assert captured["token"] == "fcm-token"
    assert captured["title"] == "📝 ES締切まで3日！"
    assert captured["body"] == "【企業】03/10が締切です"
    assert captured["data"] == {
        "type": "schedule_reminder",
        "schedule_id": str(schedule.id),
        "days_before": "3",
    }


@pytest.mark.anyio
async def test_send_schedule_reminder_for_interview_1day() -> None:
    service = NotificationService()
    schedule = _build_schedule(
        schedule_type=ScheduleType.INTERVIEW,
        scheduled_at=datetime(2026, 3, 10, 14, 0, tzinfo=UTC),
    )
    captured: dict[str, object] = {}

    async def fake_send_push(
        self: NotificationService,
        fcm_token: str,
        title: str,
        body: str,
        data: dict[str, str] | None = None,
    ) -> bool:
        captured["title"] = title
        captured["body"] = body
        captured["data"] = data
        return True

    service.send_push = MethodType(fake_send_push, service)

    result = await service.send_schedule_reminder(
        fcm_token="fcm-token",
        schedule=schedule,
        days_before=1,
    )

    assert result is True
    assert captured["title"] == "💼 明日は企業の面接です"
    assert captured["body"] == "23:00〜 場所未定"
    assert captured["data"] == {
        "type": "schedule_reminder",
        "schedule_id": str(schedule.id),
        "days_before": "1",
    }


@pytest.mark.anyio
async def test_send_new_schedule_detected() -> None:
    service = NotificationService()
    captured: dict[str, object] = {}

    async def fake_send_push(
        self: NotificationService,
        fcm_token: str,
        title: str,
        body: str,
        data: dict[str, str] | None = None,
    ) -> bool:
        captured["token"] = fcm_token
        captured["title"] = title
        captured["body"] = body
        captured["data"] = data
        return True

    service.send_push = MethodType(fake_send_push, service)

    result = await service.send_new_schedule_detected(
        fcm_token="fcm-token",
        company_name="株式会社サンプル",
        schedule_count=2,
    )

    assert result is True
    assert captured["token"] == "fcm-token"
    assert captured["title"] == "📅 新しいスケジュールが追加されました"
    assert captured["body"] == "【株式会社サンプル】2件の予定を自動登録しました"
    assert captured["data"] == {
        "type": "new_schedule_detected",
        "company_name": "株式会社サンプル",
        "schedule_count": "2",
    }
