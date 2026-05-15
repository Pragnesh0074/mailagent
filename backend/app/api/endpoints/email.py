from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from app.models.email import (
    ApprovalDraft,
    ApprovalSend,
    AutoReplyConfig,
    AutoReplyConfigUpdate,
    EmailResponse,
    EmailDetail,
    EmailReply,
    EmailSend,
)
from app.services.approval_service import ApprovalService
from app.services.cache_service import CacheService
from app.services.email_service import EmailService
from app.services.auto_reply_service import (
    AutoReplyConfigService,
    get_auto_reply_block_reason,
    process_recent_emails,
)

router = APIRouter()

@router.get("/summaries", response_model=EmailResponse)
async def get_summaries(
    page_token: Optional[str] = None,
    auto_reply: bool = False,
):
    try:
        result = await process_recent_emails(
            auto_reply=auto_reply,
            max_results=10,
            page_token=page_token,
        )
        return EmailResponse(emails=result["emails"], next_page_token=result["next_page_token"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auto-reply/status", response_model=AutoReplyConfig)
async def get_auto_reply_status(
    config_service: AutoReplyConfigService = Depends()
):
    return config_service.get()

@router.post("/auto-reply/status", response_model=AutoReplyConfig)
async def update_auto_reply_status(
    payload: AutoReplyConfigUpdate,
    config_service: AutoReplyConfigService = Depends()
):
    return config_service.update(
        enabled=payload.enabled,
        interval_seconds=payload.interval_seconds,
    )

@router.post("/send")
async def send_email(
    payload: EmailSend,
    email_service: EmailService = Depends()
):
    try:
        sent_message = await email_service.send_email(
            payload.recipients,
            payload.subject,
            payload.body,
        )
        return {
            "status": "success",
            "message": "Email sent",
            "message_id": sent_message.get("id") if isinstance(sent_message, dict) else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/approvals", response_model=list[ApprovalDraft])
async def list_approvals(
    status: Optional[str] = "pending",
    approval_service: ApprovalService = Depends()
):
    return [
        approval
        for approval in approval_service.list(status=status)
        if not get_auto_reply_block_reason(approval)
    ]

@router.post("/approvals/{email_id}/send")
async def send_approval(
    email_id: str,
    payload: ApprovalSend,
    approval_service: ApprovalService = Depends(),
    cache_service: CacheService = Depends(),
    email_service: EmailService = Depends()
):
    approval = approval_service.get(email_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval draft not found")

    if approval.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Approval draft is not pending")

    block_reason = get_auto_reply_block_reason(approval)
    if block_reason:
        approval_service.mark_rejected(email_id)
        summary_data = cache_service.get_cached_summary(email_id) or {}
        summary_data["approval_pending"] = False
        summary_data["auto_reply_rejected"] = True
        cache_service.save_to_cache(email_id, summary_data)
        raise HTTPException(status_code=400, detail="This sender is blocked from AI replies")

    reply_content = (payload.reply_content or approval.get("draft") or "").strip()
    if not reply_content:
        raise HTTPException(status_code=400, detail="Reply content cannot be empty")

    try:
        sent_message = await email_service.send_reply(email_id, reply_content)
        message_id = sent_message.get("id") if isinstance(sent_message, dict) else None
        approval_service.mark_sent(email_id, message_id, reply_content)

        summary_data = cache_service.get_cached_summary(email_id) or {}
        summary_data["auto_replied"] = True
        summary_data["approval_pending"] = False
        summary_data["auto_reply_rejected"] = False
        summary_data["auto_reply_error"] = None
        summary_data["auto_reply_message_id"] = message_id
        cache_service.save_to_cache(email_id, summary_data)

        return {
            "status": "success",
            "message": "Approval sent",
            "message_id": message_id,
        }
    except Exception as e:
        approval_service.mark_error(email_id, str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approvals/{email_id}/reject", response_model=ApprovalDraft)
async def reject_approval(
    email_id: str,
    approval_service: ApprovalService = Depends(),
    cache_service: CacheService = Depends()
):
    try:
        approval = approval_service.mark_rejected(email_id)
        summary_data = cache_service.get_cached_summary(email_id) or {}
        summary_data["approval_pending"] = False
        summary_data["auto_reply_rejected"] = True
        cache_service.save_to_cache(email_id, summary_data)
        return approval
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{email_id}", response_model=EmailDetail)
async def get_email_detail(
    email_id: str,
    email_service: EmailService = Depends()
):
    try:
        return await email_service.get_email_details(email_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{email_id}/reply")
async def reply_to_email(
    email_id: str,
    payload: EmailReply,
    email_service: EmailService = Depends(),
    cache_service: CacheService = Depends(),
    approval_service: ApprovalService = Depends()
):
    try:
        sent_message = await email_service.send_reply(email_id, payload.reply_content)
        message_id = sent_message.get("id") if isinstance(sent_message, dict) else None
        summary_data = cache_service.get_cached_summary(email_id) or {}
        summary_data["auto_replied"] = True
        summary_data["approval_pending"] = False
        summary_data["auto_reply_rejected"] = False
        summary_data["auto_reply_error"] = None
        summary_data["auto_reply_message_id"] = message_id
        cache_service.save_to_cache(email_id, summary_data)

        approval = approval_service.get(email_id)
        if approval and approval.get("status") == "pending":
            approval_service.mark_sent(email_id, message_id, payload.reply_content)

        return {
            "status": "success",
            "message": "Reply sent",
            "message_id": message_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
