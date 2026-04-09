"""Inbox processing pipeline — coordinates Gmail, intelligence, and task storage."""

import json
from datetime import datetime
from pathlib import Path

import gmail_client as gmail
import intelligence as ai

TASKS_FILE = Path("tasks.md")
WAITING_FILE = Path("waiting.json")


def _load_waiting() -> list[dict]:
    if WAITING_FILE.exists():
        return json.loads(WAITING_FILE.read_text())
    return []


def _save_waiting(waiting: list[dict]) -> None:
    WAITING_FILE.write_text(json.dumps(waiting, indent=2))


def _append_tasks(tasks: list[dict], email: dict) -> None:
    if not tasks:
        return
    with open(TASKS_FILE, "a") as f:
        f.write(f"\n## Tasks from: {email.get('subject', 'unknown')} ({datetime.now().date()})\n")
        for t in tasks:
            due = f" (due: {t['due_date']})" if t.get("due_date") else ""
            f.write(f"- [ ] {t['task']}{due}\n")


def process_inbox(max_results: int = 20) -> list[dict]:
    """Fetch inbox, classify each email, and enrich with AI.

    Returns a list of processed email dicts ready for the UI.
    """
    emails = gmail.list_emails(query="in:inbox is:unread", max_results=max_results)
    processed = []

    for email in emails:
        category = ai.classify_email(email)
        email["category"] = category

        if category in ("urgent", "reply_needed", "scheduling"):
            thread = gmail.get_thread(email["thread_id"])
            email["summary"] = ai.summarize_thread(thread)

        if category == "urgent":
            tasks = ai.extract_tasks(email)
            email["tasks"] = tasks
            _append_tasks(tasks, email)

        if category == "reply_needed":
            email["draft_reply"] = ai.draft_reply(email)

        if category == "scheduling":
            email["appointment_proposal"] = ai.generate_appointment_proposal(email)

        if category == "ticket":
            email["ticket_info"] = ai.detect_ticket(email)

        if category == "junk":
            # Auto-archive after classification; deletion happens after 7 days via UI setting
            gmail.archive_email(email["id"])

        if category == "fyi":
            gmail.mark_read(email["id"])

        gmail.apply_label(email["id"], f"mailai/{category}")
        processed.append(email)

    return processed


def process_sent(max_results: int = 20) -> None:
    """Check sent emails and create follow-up reminders when needed."""
    sent = gmail.list_sent(max_results=max_results)
    waiting = _load_waiting()
    waiting_ids = {w["id"] for w in waiting}

    for email in sent:
        if email["id"] in waiting_ids:
            continue
        if ai.detect_request_in_sent(email):
            followup_date = ai.suggest_followup_date(email)
            waiting.append({
                "id": email["id"],
                "thread_id": email["thread_id"],
                "subject": email["subject"],
                "to": email["to"],
                "sent_date": email["date"],
                "followup_date": followup_date.isoformat(),
                "dismissed": False,
            })

    _save_waiting(waiting)


def get_waiting_emails() -> list[dict]:
    """Return waiting emails with reply-received check."""
    waiting = _load_waiting()
    result = []
    for w in waiting:
        if w.get("dismissed"):
            continue
        # Check if a reply has arrived in the thread
        thread = gmail.get_thread(w["thread_id"])
        my_sent = [m for m in thread if "SENT" in m.get("labels", [])]
        replies = [m for m in thread if "SENT" not in m.get("labels", [])]
        if len(replies) > 0 and len(my_sent) > 0:
            # Reply received — auto-dismiss
            w["dismissed"] = True
            continue
        today = datetime.now().date().isoformat()
        w["overdue"] = w["followup_date"] < today
        result.append(w)

    _save_waiting(waiting)
    return result


def dismiss_waiting(email_id: str) -> None:
    waiting = _load_waiting()
    for w in waiting:
        if w["id"] == email_id:
            w["dismissed"] = True
    _save_waiting(waiting)


def get_newsletters() -> list[dict]:
    """Return emails classified as newsletters."""
    return gmail.list_emails(query="label:mailai/newsletter", max_results=50)
