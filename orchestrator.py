import json
import os
from datetime import datetime

from gmail_client import GmailClient
from intelligence import (
    classify_email,
    detect_request_in_sent,
    detect_ticket,
    draft_reply,
    extract_tasks,
    generate_appointment_proposal,
    suggest_followup_date,
    summarize_thread,
)

EMAILS_CACHE = "emails_cache.json"
CORRECTIONS_FILE = "corrections.json"
TASKS_FILE = "tasks.md"
WAITING_FILE = "waiting.json"


# ------------------------------------------------------------------
# JSON helpers
# ------------------------------------------------------------------

def load_json(path: str, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path: str, data) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ------------------------------------------------------------------
# Corrections
# ------------------------------------------------------------------

def load_corrections() -> list[dict]:
    return load_json(CORRECTIONS_FILE, [])


def save_correction(snippet: str, wrong_label: str, correct_label: str) -> None:
    corrections = load_corrections()
    corrections.append(
        {
            "snippet": snippet,
            "wrong_label": wrong_label,
            "correct_label": correct_label,
            "timestamp": datetime.now().isoformat(),
        }
    )
    save_json(CORRECTIONS_FILE, corrections)


# ------------------------------------------------------------------
# Tasks
# ------------------------------------------------------------------

def _append_tasks(tasks: list[dict], subject: str) -> None:
    with open(TASKS_FILE, "a") as f:
        for t in tasks:
            due = t.get("due_date") or "no due date"
            f.write(f"- [ ] {t['task']} (from: {subject}, due: {due})\n")


# ------------------------------------------------------------------
# Core pipeline
# ------------------------------------------------------------------

def process_inbox(max_results: int = 30) -> list[dict]:
    client = GmailClient()
    corrections = load_corrections()
    emails = client.list_emails(query="in:inbox is:unread", max_results=max_results)

    processed = [_process_email(email, client, corrections) for email in emails]

    _process_sent_for_waiting(client)

    cache = load_json(EMAILS_CACHE, [])
    by_id = {e["id"]: e for e in cache}
    for p in processed:
        by_id[p["id"]] = p
    save_json(EMAILS_CACHE, list(by_id.values()))

    return processed


def _process_email(email: dict, client: GmailClient, corrections: list[dict]) -> dict:
    category = classify_email(email, corrections)
    result: dict = {**email, "category": category, "processed_at": datetime.now().isoformat()}

    if category in ("urgent", "reply_needed", "fyi"):
        result["summary"] = summarize_thread([email])

    if category in ("urgent", "reply_needed"):
        tasks = extract_tasks(email)
        result["tasks"] = tasks
        if tasks:
            _append_tasks(tasks, email.get("subject", ""))

    if category == "reply_needed":
        result["draft_reply"] = draft_reply(email)

    if category == "ticket":
        result["ticket_data"] = detect_ticket(email)

    if category == "scheduling":
        result["appointment_proposal"] = generate_appointment_proposal(email)

    if category in ("junk", "fyi"):
        client.mark_read(email["id"])

    client.apply_label(email["id"], f"mailai/{category}")

    return result


def _process_sent_for_waiting(client: GmailClient) -> None:
    sent = client.list_sent(max_results=20)
    waiting: list[dict] = load_json(WAITING_FILE, [])
    waiting_ids = {w["id"] for w in waiting}

    for email in sent:
        if email["id"] in waiting_ids:
            thread = client.list_emails(
                query=f"threadId:{email['thread_id']}", max_results=5
            )
            if len(thread) > 1:
                waiting = [w for w in waiting if w["id"] != email["id"]]
        else:
            if detect_request_in_sent(email):
                waiting.append(
                    {
                        "id": email["id"],
                        "thread_id": email.get("thread_id"),
                        "subject": email.get("subject", ""),
                        "to": email.get("to", ""),
                        "sent_date": email.get("date", ""),
                        "follow_up_date": suggest_followup_date(email).isoformat(),
                        "dismissed": False,
                    }
                )

    save_json(WAITING_FILE, waiting)


# ------------------------------------------------------------------
# Query helpers (used by server.py)
# ------------------------------------------------------------------

def get_cached_emails(category: str | None = None) -> list[dict]:
    cache = load_json(EMAILS_CACHE, [])
    if category and category != "all":
        return [e for e in cache if e.get("category") == category]
    return cache


def get_waiting() -> list[dict]:
    return [w for w in load_json(WAITING_FILE, []) if not w.get("dismissed")]


def dismiss_waiting(email_id: str) -> None:
    waiting = load_json(WAITING_FILE, [])
    for w in waiting:
        if w["id"] == email_id:
            w["dismissed"] = True
    save_json(WAITING_FILE, waiting)


def remove_from_cache(email_id: str) -> None:
    cache = [e for e in load_json(EMAILS_CACHE, []) if e["id"] != email_id]
    save_json(EMAILS_CACHE, cache)
