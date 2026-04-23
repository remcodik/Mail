"""process_inbox() pipeline — fetches, classifies, and enriches emails per account."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from gmail_client import GmailClient
from intelligence import (
    classify_email,
    detect_request_in_sent,
    detect_ticket,
    draft_reply,
    extract_tasks,
    suggest_followup_date,
    summarize_thread,
)

INBOX_CACHE = Path("data/inbox_cache.json")
WAITING_FILE = Path("data/waiting.json")
TASKS_FILE = Path("data/tasks.json")


def _load_json(path: Path, default):
    if not path.exists():
        return default
    with open(path) as f:
        return json.load(f)


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def process_inbox(account_email: str, max_results: int = 30) -> list[dict]:
    """Fetch, classify and enrich inbox emails. Returns enriched email list."""
    client = GmailClient(account_email)
    emails = client.list_emails(query="in:inbox is:unread", max_results=max_results)

    cache = _load_json(INBOX_CACHE, {})
    enriched: list[dict] = []

    for email in emails:
        eid = f"{account_email}:{email['id']}"
        if eid in cache:
            enriched.append(cache[eid])
            continue

        category = classify_email(email)
        email["category"] = category

        # Per-category enrichment
        if category in ("urgent", "reply_needed", "scheduling"):
            email["summary"] = summarize_thread([email])
            email["tasks"] = extract_tasks(email)

        if category == "reply_needed":
            email["draft_reply"] = draft_reply(email)

        if category == "ticket":
            email["ticket_data"] = detect_ticket(email)

        cache[eid] = email
        enriched.append(email)

    _save_json(INBOX_CACHE, cache)
    return enriched


def process_sent(account_email: str, max_results: int = 20) -> None:
    """Check sent mail for open requests → add to waiting list."""
    client = GmailClient(account_email)
    sent = client.list_sent(max_results=max_results)
    waiting = _load_json(WAITING_FILE, [])
    existing_ids = {w["id"] for w in waiting}

    for email in sent:
        if email["id"] in existing_ids:
            continue
        if detect_request_in_sent(email):
            waiting.append(
                {
                    "id": email["id"],
                    "account": account_email,
                    "subject": email["subject"],
                    "to": email["to"],
                    "sent_date": email["date"],
                    "followup_date": suggest_followup_date(email),
                    "done": False,
                }
            )

    _save_json(WAITING_FILE, waiting)


def get_waiting(account_email: str | None = None) -> list[dict]:
    waiting = _load_json(WAITING_FILE, [])
    if account_email:
        waiting = [w for w in waiting if w["account"] == account_email]
    today = date.today().isoformat()
    for w in waiting:
        w["overdue"] = w["followup_date"] < today
    return [w for w in waiting if not w["done"]]


def dismiss_waiting(email_id: str) -> None:
    waiting = _load_json(WAITING_FILE, [])
    for w in waiting:
        if w["id"] == email_id:
            w["done"] = True
    _save_json(WAITING_FILE, waiting)


def save_task(task: dict) -> None:
    tasks = _load_json(TASKS_FILE, [])
    tasks.append(task)
    _save_json(TASKS_FILE, tasks)


def get_tasks(account_email: str | None = None) -> list[dict]:
    tasks = _load_json(TASKS_FILE, [])
    if account_email:
        tasks = [t for t in tasks if t.get("account") == account_email]
    return tasks
