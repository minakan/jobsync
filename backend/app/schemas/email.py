from datetime import datetime

from pydantic import BaseModel


class GmailConnectResponse(BaseModel):
    oauth_url: str
    state: str


class GmailCallbackResponse(BaseModel):
    status: str
    task_id: str


class EmailSyncResponse(BaseModel):
    task_id: str
    status: str


class EmailListItem(BaseModel):
    id: str
    message_id: str
    subject: str
    sender: str
    sender_email: str
    received_at: datetime
    company_name: str | None


class EmailListResponse(BaseModel):
    items: list[EmailListItem]
