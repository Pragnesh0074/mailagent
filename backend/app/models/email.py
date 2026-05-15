from pydantic import BaseModel
from typing import List, Optional

class EmailSummary(BaseModel):
    id: str
    subject: str
    sender: str
    snippet: str
    summary: str
    category: str
    is_important: bool = False
    auto_replied: bool = False
    approval_pending: bool = False
    auto_reply_error: Optional[str] = None
    received_at: str

class EmailResponse(BaseModel):
    emails: List[EmailSummary]
    next_page_token: Optional[str]

class EmailDetail(BaseModel):
    id: str
    subject: str
    sender: str
    to: str
    date: str
    body: str

class EmailReply(BaseModel):
    reply_content: str

class EmailSend(BaseModel):
    recipients: List[str]
    subject: str
    body: str

class AutoReplyConfig(BaseModel):
    enabled: bool = False
    interval_seconds: int = 120
    last_run_at: Optional[str] = None
    last_error: Optional[str] = None
    last_checked_count: Optional[int] = None

class AutoReplyConfigUpdate(BaseModel):
    enabled: bool
    interval_seconds: Optional[int] = None

class ApprovalDraft(BaseModel):
    id: str
    email_id: str
    subject: str
    sender: str
    snippet: str
    summary: str
    draft: str
    status: str
    received_at: str
    created_at: str
    updated_at: str
    sent_message_id: Optional[str] = None
    error: Optional[str] = None

class ApprovalSend(BaseModel):
    reply_content: Optional[str] = None
