from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "jobsync",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.email_sync_task",
        "app.tasks.inbound_email_task",
        "app.tasks.reminder_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Tokyo",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    task_track_started=True,
    beat_schedule={
        "send-daily-reminders-utc-0000": {
            "task": "app.tasks.reminder_task.send_daily_reminders",
            "schedule": crontab(minute=0, hour=0),
        },
        "send-daily-reminders-utc-1200": {
            "task": "app.tasks.reminder_task.send_daily_reminders",
            "schedule": crontab(minute=0, hour=12),
        },
    },
)
