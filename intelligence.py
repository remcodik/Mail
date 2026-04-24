import os
from datetime import date, timedelta
from typing import Any

import anthropic
from dotenv import load_dotenv

load_dotenv()

_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-sonnet-4-6"

CATEGORIES = [
    "urgent", "reply_needed", "newsletter", "junk",
    "fyi", "ticket", "awaiting_reply", "scheduling",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _text_block(text: str, cache: bool = False) -> dict:
    """Return a text content block, only adding cache_control when text is non-empty."""
    block: dict[str, Any] = {"type": "text", "text": text}
    if cache and text.strip():
        block["cache_control"] = {"type": "ephemeral"}
    return block


def _build_content(*pairs: tuple[str, bool]) -> list[dict]:
    """Build a list of text blocks from (text, cache) pairs, dropping empty ones."""
    return [_text_block(t, c) for t, c in pairs if t and t.strip()]


def _corrections_block(corrections: list[dict] | None) -> str:
    """Format recent corrections as few-shot examples for the classification prompt."""
    if not corrections:
        return ""
    lines = ["Recent user corrections (use as examples):"]
    for c in corrections[-10:]:
        lines.append(
            f'  Email snippet: "{c.get("snippet", "")}" '
            f'— was labeled {c.get("wrong_label")} '
            f'→ correct label: {c.get("correct_label")}'
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# classify_email
# ---------------------------------------------------------------------------

_CLASSIFY_SYSTEM = f"""You are an email triage assistant. Classify the email into exactly one of these categories:
{', '.join(CATEGORIES)}

Definitions:
- urgent: requires immediate attention or action
- reply_needed: sender expects a reply
- newsletter: mass marketing or subscription content
- junk: spam or irrelevant
- fyi: informational, no action needed
- ticket: event ticket, boarding pass, booking confirmation, or receipt
- awaiting_reply: a sent email where you are waiting for a response
- scheduling: mentions scheduling a meeting or call

Respond with ONLY the category name, nothing else."""


def classify_email(email: dict, corrections: list[dict] | None = None) -> str:
    corrections_text = _corrections_block(corrections)
    user_content = _build_content(
        (_CLASSIFY_SYSTEM, True),         # cache the static system instructions
        (corrections_text, True),         # cache corrections block when present
        (f"From: {email.get('from', '')}\nSubject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=16,
        messages=[{"role": "user", "content": user_content}],
    )
    label = response.content[0].text.strip().lower()
    return label if label in CATEGORIES else "fyi"


# ---------------------------------------------------------------------------
# summarize_thread
# ---------------------------------------------------------------------------

_SUMMARIZE_SYSTEM = "You are an email assistant. Summarize the email thread in 2-3 concise sentences. Focus on what happened and what (if anything) is needed."


def summarize_thread(messages: list[dict]) -> str:
    thread_text = "\n\n---\n\n".join(
        f"From: {m.get('from', '')}\nDate: {m.get('date', '')}\n\n{m.get('body', '')}"
        for m in messages
    )
    user_content = _build_content(
        (_SUMMARIZE_SYSTEM, True),
        (thread_text, False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# extract_tasks
# ---------------------------------------------------------------------------

_TASKS_SYSTEM = """You are a task extraction assistant. Extract action items from the email.
Return one task per line in this format:
TASK: <description> | DUE: <YYYY-MM-DD or "none">

If there are no tasks, respond with: NO_TASKS"""


def extract_tasks(email: dict) -> list[dict]:
    user_content = _build_content(
        (_TASKS_SYSTEM, True),
        (f"From: {email.get('from', '')}\nSubject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = response.content[0].text.strip()
    if raw == "NO_TASKS":
        return []

    tasks = []
    for line in raw.splitlines():
        if not line.startswith("TASK:"):
            continue
        parts = line.split("|")
        task_text = parts[0].replace("TASK:", "").strip()
        due_raw = parts[1].replace("DUE:", "").strip() if len(parts) > 1 else "none"
        due_date: date | None = None
        if due_raw and due_raw.lower() != "none":
            try:
                due_date = date.fromisoformat(due_raw)
            except ValueError:
                pass
        tasks.append({"task": task_text, "due_date": due_date})
    return tasks


# ---------------------------------------------------------------------------
# draft_reply
# ---------------------------------------------------------------------------

_DRAFT_SYSTEM = "You are an email assistant. Draft a reply to the email below. Be concise and clear. Output only the reply body — no subject line, no greeting preamble beyond what is natural."


def draft_reply(email: dict, tone: str = "professional") -> str:
    tone_instruction = f"Tone: {tone}."
    user_content = _build_content(
        (_DRAFT_SYSTEM, True),
        (tone_instruction, False),
        (f"From: {email.get('from', '')}\nSubject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# detect_ticket
# ---------------------------------------------------------------------------

_TICKET_SYSTEM = """You are a ticket/booking detection assistant. Determine if this email contains a ticket, boarding pass, booking confirmation, or receipt.

If yes, respond with JSON in this exact format:
{"type": "event_ticket|boarding_pass|receipt|reservation", "event": "...", "date": "YYYY-MM-DD or null", "seat": "... or null", "barcode_url": "... or null"}

If no, respond with: NOT_A_TICKET"""

_TICKET_DOMAINS = {
    "ticketmaster.com", "eventbrite.com", "booking.com",
    "klm.com", "ryanair.com", "airbnb.com", "opentable.com",
}


def detect_ticket(email: dict) -> dict | None:
    sender = email.get("from", "").lower()
    subject = email.get("subject", "").lower()
    body = email.get("body", "").lower()

    ticket_keywords = {"ticket", "booking", "confirmation", "reservation", "flight", "seat", "gate", "barcode", "qr code"}
    domain_match = any(d in sender for d in _TICKET_DOMAINS)
    keyword_match = any(k in subject or k in body for k in ticket_keywords)

    if not domain_match and not keyword_match:
        return None

    user_content = _build_content(
        (_TICKET_SYSTEM, True),
        (f"From: {email.get('from', '')}\nSubject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = response.content[0].text.strip()
    if raw == "NOT_A_TICKET":
        return None
    try:
        import json
        return json.loads(raw)
    except (ValueError, KeyError):
        return None


# ---------------------------------------------------------------------------
# detect_scheduling_intent
# ---------------------------------------------------------------------------

_SCHEDULING_SYSTEM = """Does this email mention scheduling a meeting, call, or appointment?
Respond with only YES or NO."""


def detect_scheduling_intent(email: dict) -> bool:
    user_content = _build_content(
        (_SCHEDULING_SYSTEM, True),
        (f"Subject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=4,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip().upper() == "YES"


# ---------------------------------------------------------------------------
# detect_request_in_sent
# ---------------------------------------------------------------------------

_SENT_REQUEST_SYSTEM = """You sent this email. Does it contain a request where you are waiting for a reply (e.g. a question, an ask, or a request for action)?
Respond with only YES or NO."""


def detect_request_in_sent(email: dict) -> bool:
    user_content = _build_content(
        (_SENT_REQUEST_SYSTEM, True),
        (f"Subject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=4,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip().upper() == "YES"


# ---------------------------------------------------------------------------
# generate_appointment_proposal
# ---------------------------------------------------------------------------

_APPOINTMENT_SYSTEM = """You are a scheduling assistant. The sender wants to meet. Write a polite reply proposing 3 concrete time slots in the next 5 business days. Keep it brief. Output only the reply body."""


def generate_appointment_proposal(email: dict) -> str:
    user_content = _build_content(
        (_APPOINTMENT_SYSTEM, True),
        (f"From: {email.get('from', '')}\nSubject: {email.get('subject', '')}\n\n{email.get('body', '')}", False),
    )
    response = _client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# suggest_followup_date
# ---------------------------------------------------------------------------

def suggest_followup_date(email: dict) -> date:
    """Return a suggested follow-up date (3 business days from today by default)."""
    today = date.today()
    days_added = 0
    candidate = today
    while days_added < 3:
        candidate += timedelta(days=1)
        if candidate.weekday() < 5:  # Mon–Fri
            days_added += 1
    return candidate
