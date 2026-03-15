from __future__ import annotations

import pytest

from app.tasks import reminder_task


@pytest.mark.anyio
async def test_send_daily_reminders_skips_when_firebase_credentials_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(reminder_task.settings, "FIREBASE_CREDENTIALS_JSON", "{}")

    class _NotificationServiceShouldNotRun:
        def __init__(self) -> None:
            raise AssertionError("NotificationService must not run when credentials are empty")

    monkeypatch.setattr(reminder_task, "NotificationService", _NotificationServiceShouldNotRun)

    result = await reminder_task._send_daily_reminders()

    assert result == {"sent": 0, "failed": 0}


def test_is_firebase_credentials_empty() -> None:
    original = reminder_task.settings.FIREBASE_CREDENTIALS_JSON
    try:
        reminder_task.settings.FIREBASE_CREDENTIALS_JSON = "{}"
        assert reminder_task._is_firebase_credentials_empty() is True

        reminder_task.settings.FIREBASE_CREDENTIALS_JSON = ""
        assert reminder_task._is_firebase_credentials_empty() is True

        reminder_task.settings.FIREBASE_CREDENTIALS_JSON = '{"type":"service_account"}'
        assert reminder_task._is_firebase_credentials_empty() is False
    finally:
        reminder_task.settings.FIREBASE_CREDENTIALS_JSON = original
