from __future__ import annotations

import asyncio
import json
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.logger import logger
from app.models.schedule import Schedule, ScheduleType

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ImportError:  # pragma: no cover - firebase-admin が未導入の実行環境向け
    firebase_admin = None
    credentials = None
    messaging = None

JST = ZoneInfo("Asia/Tokyo")


class NotificationService:
    def __init__(self) -> None:
        """Firebase Admin SDK初期化（settings.FIREBASE_CREDENTIALS_JSONから）"""
        raw = settings.FIREBASE_CREDENTIALS_JSON.strip()
        self._dummy_mode = raw in {"", "{}"}
        self._firebase_ready = False

        if self._dummy_mode:
            logger.info("NotificationService started in dummy mode (FIREBASE_CREDENTIALS_JSON is empty).")
            return

        if firebase_admin is None or credentials is None or messaging is None:
            logger.warning("firebase-admin is unavailable; NotificationService runs in dummy mode.")
            self._dummy_mode = True
            return

        try:
            credentials_payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.exception("FIREBASE_CREDENTIALS_JSON is invalid JSON; fallback to dummy mode.")
            self._dummy_mode = True
            return

        if not isinstance(credentials_payload, dict) or not credentials_payload:
            logger.warning("FIREBASE_CREDENTIALS_JSON is empty; fallback to dummy mode.")
            self._dummy_mode = True
            return

        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_credentials = credentials.Certificate(credentials_payload)
            firebase_admin.initialize_app(firebase_credentials)

        self._firebase_ready = True

    async def send_push(
        self,
        fcm_token: str,
        title: str,
        body: str,
        data: dict[str, str] | None = None,
    ) -> bool:
        """FCMでプッシュ通知を送信。失敗してもFalseを返す（例外は送出しない）"""
        if not fcm_token.strip():
            logger.warning("Push notification skipped because fcm_token is empty.")
            return False

        if self._dummy_mode or not self._firebase_ready:
            logger.info("Dummy push notification: title=%s body=%s", title, body)
            return True

        message = messaging.Message(
            token=fcm_token,
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
        )

        try:
            await asyncio.to_thread(messaging.send, message)
            return True
        except Exception:  # noqa: BLE001
            logger.exception("Failed to send push notification.")
            return False

    async def send_schedule_reminder(
        self,
        fcm_token: str,
        schedule: Schedule,
        days_before: int,
    ) -> bool:
        """
        days_before=3: "📝 ES締切まで3日！" / "【{company}】{date}が締切です"
        days_before=1: "🚨 明日がES締切です！" / "【{company}】明日{time}が締切です"
        面接の場合: "💼 明日は{company}の面接です" / "{time}〜 {location_or_online}"
        """
        scheduled_at_jst = schedule.scheduled_at.astimezone(JST)
        company_name = _resolve_company_name(schedule)
        time_label = scheduled_at_jst.strftime("%H:%M")
        date_label = scheduled_at_jst.strftime("%m/%d")

        if schedule.type == ScheduleType.INTERVIEW:
            if days_before <= 1:
                title = f"💼 明日は{company_name}の面接です"
            else:
                title = f"💼 {company_name}の面接まで{days_before}日です"

            location_or_online = schedule.location or ("オンライン" if schedule.online_url else "場所未定")
            body = f"{time_label}〜 {location_or_online}"
        elif days_before <= 1:
            title = "🚨 明日がES締切です！"
            body = f"【{company_name}】明日{time_label}が締切です"
        else:
            title = f"📝 ES締切まで{days_before}日！"
            body = f"【{company_name}】{date_label}が締切です"

        data = {
            "type": "schedule_reminder",
            "schedule_id": str(schedule.id),
            "days_before": str(days_before),
        }
        return await self.send_push(fcm_token=fcm_token, title=title, body=body, data=data)

    async def send_new_schedule_detected(
        self,
        fcm_token: str,
        company_name: str,
        schedule_count: int,
    ) -> bool:
        """
        "📅 新しいスケジュールが追加されました"
        "【{company}】{n}件の予定を自動登録しました"
        """
        return await self.send_push(
            fcm_token=fcm_token,
            title="📅 新しいスケジュールが追加されました",
            body=f"【{company_name}】{schedule_count}件の予定を自動登録しました",
            data={
                "type": "new_schedule_detected",
                "company_name": company_name,
                "schedule_count": str(schedule_count),
            },
        )


def _resolve_company_name(schedule: Schedule) -> str:
    if schedule.company is not None and schedule.company.name.strip():
        return schedule.company.name.strip()
    return "企業"
