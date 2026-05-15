import json
import os
from datetime import datetime, timezone
from typing import Optional

APPROVAL_QUEUE_FILE = "approval_queue.json"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


class ApprovalService:
    def __init__(self):
        self.queue_path = APPROVAL_QUEUE_FILE
        self._ensure_queue_exists()

    def _ensure_queue_exists(self):
        if not os.path.exists(self.queue_path):
            self._save({})

    def _load(self):
        try:
            with open(self.queue_path, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    def _save(self, data):
        with open(self.queue_path, "w") as f:
            json.dump(data, f, indent=2)

    def list(self, status: Optional[str] = None):
        queue = self._load()
        items = list(queue.values())

        if status:
            items = [item for item in items if item.get("status") == status]

        return sorted(items, key=lambda item: item.get("created_at", ""), reverse=True)

    def get(self, email_id: str):
        return self._load().get(email_id)

    def has_pending(self, email_id: str):
        item = self.get(email_id)
        return bool(item and item.get("status") == "pending")

    def upsert_pending(self, email, summary_data, draft: str):
        queue = self._load()
        existing = queue.get(email["id"], {})
        created_at = existing.get("created_at") or _now_iso()
        now = _now_iso()

        item = {
            "id": email["id"],
            "email_id": email["id"],
            "subject": email["subject"],
            "sender": email["sender"],
            "snippet": email["snippet"],
            "summary": summary_data.get("summary", email["snippet"][:150] + "..."),
            "draft": draft,
            "status": "pending",
            "received_at": email["received_at"],
            "created_at": created_at,
            "updated_at": now,
            "sent_message_id": None,
            "error": None,
        }

        queue[email["id"]] = item
        self._save(queue)
        return item

    def mark_sent(self, email_id: str, sent_message_id: Optional[str], reply_content: str):
        queue = self._load()
        item = queue.get(email_id)
        if not item:
            raise Exception("Approval draft not found")

        item["draft"] = reply_content
        item["status"] = "sent"
        item["sent_message_id"] = sent_message_id
        item["error"] = None
        item["updated_at"] = _now_iso()
        queue[email_id] = item
        self._save(queue)
        return item

    def mark_rejected(self, email_id: str):
        queue = self._load()
        item = queue.get(email_id)
        if not item:
            raise Exception("Approval draft not found")

        item["status"] = "rejected"
        item["updated_at"] = _now_iso()
        queue[email_id] = item
        self._save(queue)
        return item

    def mark_error(self, email_id: str, error: str):
        queue = self._load()
        item = queue.get(email_id)
        if not item:
            raise Exception("Approval draft not found")

        item["error"] = error
        item["updated_at"] = _now_iso()
        queue[email_id] = item
        self._save(queue)
        return item
