import asyncio
import json
import os
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Optional

from app.models.email import EmailSummary
from app.services.approval_service import ApprovalService
from app.services.cache_service import CacheService
from app.services.email_service import EmailService
from app.services.groq_service import GroqService

AUTO_REPLY_CONFIG_FILE = "auto_reply_config.json"
AUTO_REPLY_INSTRUCTIONS = (
    "Write a short, natural acknowledgement. If the email requires a choice, schedule, "
    "document, or other missing detail, ask for that detail clearly instead of using placeholders."
)
DEFAULT_AUTO_REPLY_CONFIG = {
    "enabled": False,
    "interval_seconds": 120,
    "last_run_at": None,
    "last_error": None,
}
BACKGROUND_PAGE_SIZE = 50
BACKGROUND_MAX_PAGES = 3
BLOCKED_AUTO_REPLY_DOMAINS = {
    "linkedin.com",
    "mail.linkedin.com",
    "notifications.google.com",
}
BLOCKED_AUTO_REPLY_LOCAL_PARTS = {
    "no-reply",
    "noreply",
    "do-not-reply",
    "donotreply",
    "notification",
    "notifications",
    "digest",
    "updates",
    "alerts",
    "mailer-daemon",
    "postmaster",
}
BLOCKED_AUTO_REPLY_SUBJECT_KEYWORDS = {
    "linkedin",
    "delivery status notification",
    "delivery incomplete",
    "message blocked",
    "undelivered mail",
}

AUTO_REPLY_LOCK = asyncio.Lock()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def has_confirmed_auto_reply(summary_data):
    return bool(summary_data.get("auto_replied") and summary_data.get("auto_reply_message_id"))


def get_auto_reply_block_reason(email):
    sender = email.get("sender", "")
    subject = email.get("subject", "")
    sender_name, sender_address = parseaddr(sender)
    address = (sender_address or sender).lower()
    local_part, _, domain = address.partition("@")
    subject_lower = subject.lower()

    if any(keyword in subject_lower for keyword in BLOCKED_AUTO_REPLY_SUBJECT_KEYWORDS):
        return "Automated/platform email subject is blocked from auto-reply."

    if domain in BLOCKED_AUTO_REPLY_DOMAINS or domain.endswith(".linkedin.com"):
        return "Automated/platform sender domain is blocked from auto-reply."

    if local_part in BLOCKED_AUTO_REPLY_LOCAL_PARTS:
        return "Automated sender address is blocked from auto-reply."

    if any(part in local_part for part in ("noreply", "no-reply", "notification", "digest")):
        return "Automated sender address is blocked from auto-reply."

    if "linkedin" in sender.lower() or "linkedin" in sender_name.lower():
        return "LinkedIn sender is blocked from auto-reply."

    return None


class AutoReplyConfigService:
    def __init__(self):
        self.config_path = AUTO_REPLY_CONFIG_FILE
        self._ensure_config_exists()

    def _ensure_config_exists(self):
        if not os.path.exists(self.config_path):
            self.save(DEFAULT_AUTO_REPLY_CONFIG)

    def get(self):
        try:
            with open(self.config_path, "r") as f:
                data = json.load(f)
        except Exception:
            data = {}

        return {**DEFAULT_AUTO_REPLY_CONFIG, **data}

    def save(self, config):
        with open(self.config_path, "w") as f:
            json.dump({**DEFAULT_AUTO_REPLY_CONFIG, **config}, f, indent=2)

    def update(self, *, enabled: Optional[bool] = None, interval_seconds: Optional[int] = None, **extra):
        config = self.get()

        if enabled is not None:
            config["enabled"] = enabled

        if interval_seconds is not None:
            config["interval_seconds"] = max(30, interval_seconds)

        config.update(extra)
        self.save(config)
        return config


async def maybe_auto_reply(email, summary_data, auto_reply, email_service, groq_service, cache_service):
    summary_data.setdefault("auto_replied", False)
    summary_data.setdefault("auto_reply_error", None)

    if summary_data.get("auto_replied") and not summary_data.get("auto_reply_message_id"):
        summary_data["auto_replied"] = False
        summary_data["auto_reply_error"] = "Previous auto-reply was not confirmed by Gmail; retrying."
        cache_service.save_to_cache(email["id"], summary_data)

    if not auto_reply:
        return summary_data

    if summary_data.get("auto_reply_rejected"):
        summary_data["approval_pending"] = False
        return summary_data

    if not summary_data.get("is_important", False):
        return summary_data

    block_reason = get_auto_reply_block_reason(email)
    if block_reason:
        summary_data["is_important"] = False
        summary_data["auto_replied"] = False
        summary_data["approval_pending"] = False
        summary_data["auto_reply_error"] = None
        summary_data["auto_reply_blocked_reason"] = block_reason
        cache_service.save_to_cache(email["id"], summary_data)
        return summary_data

    async with AUTO_REPLY_LOCK:
        latest_summary = cache_service.get_cached_summary(email["id"])
        if latest_summary:
            summary_data.update(latest_summary)

        if has_confirmed_auto_reply(summary_data):
            return summary_data

        approval_service = ApprovalService()
        approval = approval_service.get(email["id"])
        if approval and approval.get("status") == "pending":
            summary_data["approval_pending"] = True
            summary_data["auto_reply_error"] = None
            cache_service.save_to_cache(email["id"], summary_data)
            return summary_data
        if approval and approval.get("status") in {"rejected", "sent"}:
            summary_data["approval_pending"] = False
            summary_data["auto_reply_error"] = None
            cache_service.save_to_cache(email["id"], summary_data)
            return summary_data

        try:
            email_detail = await email_service.get_email_details(email["id"])
            email_content = email_detail.get("body") or email["snippet"]
            reply_content = await groq_service.generate_reply(
                email_content,
                AUTO_REPLY_INSTRUCTIONS,
                sender=email.get("sender", ""),
                subject=email.get("subject", ""),
            )
            approval_service.upsert_pending(email, summary_data, reply_content)
            summary_data["approval_pending"] = True
            summary_data["auto_replied"] = False
            summary_data["auto_reply_error"] = None
            cache_service.save_to_cache(email["id"], summary_data)
        except Exception as reply_err:
            summary_data["auto_reply_error"] = str(reply_err)
            cache_service.save_to_cache(email["id"], summary_data)

    return summary_data


def to_email_summary(email, summary_data):
    is_blocked = bool(get_auto_reply_block_reason(email))
    return EmailSummary(
        id=email["id"],
        subject=email["subject"],
        sender=email["sender"],
        snippet=email["snippet"],
        summary=summary_data.get("summary", email["snippet"][:150] + "..."),
        category=summary_data.get("category", "Personal"),
        is_important=summary_data.get("is_important", False) and not is_blocked,
        auto_replied=has_confirmed_auto_reply(summary_data) and not is_blocked,
        approval_pending=summary_data.get("approval_pending", False) and not is_blocked,
        auto_reply_error=summary_data.get("auto_reply_error"),
        received_at=email["received_at"],
    )


async def process_recent_emails(
    *,
    auto_reply: bool,
    max_results: int = 10,
    page_token: Optional[str] = None,
    email_service: Optional[EmailService] = None,
    groq_service: Optional[GroqService] = None,
    cache_service: Optional[CacheService] = None,
):
    email_service = email_service or EmailService()
    groq_service = groq_service or GroqService()
    cache_service = cache_service or CacheService()

    result = await email_service.fetch_recent_emails(max_results=max_results, page_token=page_token)
    emails = result["emails"]
    summarized_emails = []

    for email in emails:
        cached_data = cache_service.get_cached_summary(email["id"])

        if cached_data:
            summary_data = await maybe_auto_reply(
                email, cached_data, auto_reply, email_service, groq_service, cache_service
            )
            summarized_emails.append(to_email_summary(email, summary_data))
            continue

        try:
            ai_result = await groq_service.categorize_and_summarize(
                email["snippet"], email["sender"], email["subject"]
            )

            summary_data = {
                "summary": ai_result["summary"],
                "category": ai_result.get("category", "Personal"),
                "is_important": ai_result.get("is_important", False),
                "auto_replied": False,
                "approval_pending": False,
                "auto_reply_rejected": False,
                "auto_reply_error": None,
            }

            summary_data = await maybe_auto_reply(
                email, summary_data, auto_reply, email_service, groq_service, cache_service
            )
            cache_service.save_to_cache(email["id"], summary_data)
            summarized_emails.append(to_email_summary(email, summary_data))
        except Exception as ai_err:
            summarized_emails.append(EmailSummary(
                id=email["id"],
                subject=email["subject"],
                sender=email["sender"],
                snippet=email["snippet"],
                summary=email["snippet"][:150] + "...",
                category="Personal",
                is_important=False,
                auto_replied=False,
                auto_reply_error=str(ai_err),
                received_at=email["received_at"],
            ))

    return {
        "emails": summarized_emails,
        "next_page_token": result["next_page_token"],
    }


class AutoReplyScheduler:
    def __init__(self):
        self.config_service = AutoReplyConfigService()
        self.task = None
        self._stop_event = asyncio.Event()

    async def start(self):
        if self.task and not self.task.done():
            return

        self._stop_event.clear()
        self.task = asyncio.create_task(self._run_loop())

    async def stop(self):
        self._stop_event.set()
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self):
        while not self._stop_event.is_set():
            config = self.config_service.get()
            interval_seconds = config.get("interval_seconds", 120)
            is_enabled = config.get("enabled")

            if is_enabled:
                await self.run_once()

            try:
                sleep_seconds = interval_seconds if is_enabled else 5
                await asyncio.wait_for(self._stop_event.wait(), timeout=sleep_seconds)
            except asyncio.TimeoutError:
                pass

    async def run_once(self):
        try:
            total_checked = 0
            page_token = None

            for _ in range(BACKGROUND_MAX_PAGES):
                result = await process_recent_emails(
                    auto_reply=True,
                    max_results=BACKGROUND_PAGE_SIZE,
                    page_token=page_token,
                )
                total_checked += len(result["emails"])
                page_token = result["next_page_token"]

                if not page_token:
                    break

            self.config_service.update(
                last_run_at=_now_iso(),
                last_error=None,
                last_checked_count=total_checked,
            )
        except Exception as err:
            self.config_service.update(last_run_at=_now_iso(), last_error=str(err))
