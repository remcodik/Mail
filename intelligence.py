"""All Claude API interactions for MailAI.

No other module should import `anthropic` directly — all AI calls go through here.
"""

import json
from datetime import date, datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

_client = anthropic.Anthropic()
MODEL = "claude-sonnet-4-6"
CORRECTIONS_FILE = Path("corrections.json")

CATEGORIES = [
    "urgent",
    "reply_needed",
    "newsletter",
    "junk",
    "fyi",
    "ticket",
    "awaiting_reply",
    "scheduling",
]


def _load_corrections() -> list[dict]:
    if CORRECTIONS_FILE.exists():
        return json.loads(CORRECTIONS_FILE.read_text())[-10:]
    return []


def _corrections_prompt() -> str:
    corrections = _load_corrections()
    if not corrections:
        return ""
    lines = ["Recent user corrections (use as few-shot examples):"]
    for c in corrections:
        lines.append(
            f'  Snippet: "{c["snippet"]}" → was labelled "{c["wrong"]}", correct label: "{c["correct"]}"'
        )
    return "\n".join(lines) + "\n\n"


def _email_context(email: dict) -> str:
    return (
        f"From: {email.get('from', '')}\n"
        f"Subject: {email.get('subject', '')}\n"
        f"Body:\n{email.get('body', email.get('snippet', ''))[:2000]}"
    )


# ── Public intelligence functions ─────────────────────────────────────────────

def classify_email(email: dict) -> str:
    """Classify an email into one of the 8 categories."""
    corrections = _corrections_prompt()
    prompt = (
        f"{corrections}"
        f"Classify the following email into exactly one of these categories:\n"
        f"{', '.join(CATEGORIES)}\n\n"
        f"{_email_context(email)}\n\n"
        f"Reply with only the category name, nothing else."
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=20,
        messages=[{"role": "user", "content": prompt}],
    )
    result = msg.content[0].text.strip().lower()
    return result if result in CATEGORIES else "fyi"


def summarize_thread(messages: list[dict]) -> str:
    """Summarise an email thread in 2-3 sentences."""
    thread_text = "\n\n---\n\n".join(
        f"From: {m.get('from', '')}\n{m.get('body', m.get('snippet', ''))[:1000]}"
        for m in messages
    )
    prompt = (
        f"Summarise this email thread in 2-3 concise sentences:\n\n{thread_text}"
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def extract_tasks(email: dict) -> list[dict]:
    """Extract action items from an email, each with an optional due_date."""
    prompt = (
        f"Extract all action items / tasks from the following email. "
        f"Return a JSON array of objects with keys 'task' (string) and 'due_date' (ISO date string or null).\n\n"
        f"{_email_context(email)}\n\n"
        f"Return only valid JSON, no markdown."
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        return json.loads(msg.content[0].text.strip())
    except json.JSONDecodeError:
        return []


def draft_reply(email: dict, tone: str = "professional") -> str:
    """Draft a reply to the given email."""
    prompt = (
        f"Draft a {tone} reply to the following email. "
        f"Be concise and helpful. Do not include a subject line.\n\n"
        f"{_email_context(email)}"
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def detect_ticket(email: dict) -> dict | None:
    """Detect if an email contains a ticket/boarding pass/receipt.

    Returns a dict with ticket details or None.
    """
    ticket_keywords = [
        "ticket", "booking", "confirmation", "reservation", "flight",
        "seat", "gate", "barcode", "qr code", "boarding pass", "receipt",
    ]
    ticket_domains = [
        "ticketmaster.com", "eventbrite.com", "booking.com", "klm.com",
        "ryanair.com", "easyjet.com", "airbnb.com", "hotels.com",
        "stubhub.com", "seatgeek.com",
    ]

    body_lower = (email.get("body", "") + email.get("snippet", "")).lower()
    sender = email.get("from", "").lower()

    has_keyword = any(kw in body_lower for kw in ticket_keywords)
    has_domain = any(d in sender for d in ticket_domains)

    if not (has_keyword or has_domain):
        return None

    prompt = (
        f"Does this email contain a ticket, boarding pass, or receipt/reservation? "
        f"If yes, return a JSON object with keys: type (EventTicket|BoardingPass|Generic), "
        f"event (string), date (ISO date or null), seat (string or null), barcode_url (string or null). "
        f"If no, return null.\n\n"
        f"{_email_context(email)}\n\nReturn only valid JSON, no markdown."
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        result = json.loads(msg.content[0].text.strip())
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        return None


def detect_scheduling_intent(email: dict) -> bool:
    """Return True if the email involves scheduling a meeting."""
    prompt = (
        f"Does this email involve scheduling a meeting or appointment? "
        f"Reply with only 'yes' or 'no'.\n\n{_email_context(email)}"
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=5,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().lower() == "yes"


def detect_request_in_sent(email: dict) -> bool:
    """Return True if a sent email contains a request that expects a reply."""
    prompt = (
        f"Does this sent email contain a request, question, or action item that "
        f"would normally expect a reply? Reply with only 'yes' or 'no'.\n\n"
        f"{_email_context(email)}"
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=5,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().lower() == "yes"


def generate_appointment_proposal(email: dict) -> str:
    """Generate a reply proposing 3 time slots for a meeting."""
    today = datetime.now().strftime("%A, %B %d %Y")
    prompt = (
        f"Today is {today}. "
        f"Based on this scheduling email, write a professional reply proposing "
        f"3 specific available time slots in the next 7 days. "
        f"Include timezone (use the sender's timezone if detectable, otherwise UTC).\n\n"
        f"{_email_context(email)}"
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def suggest_followup_date(email: dict) -> date:
    """Suggest a follow-up date for a sent email with no reply yet."""
    prompt = (
        f"Based on the urgency and content of this sent email, "
        f"how many days should we wait before following up? "
        f"Reply with only a number between 1 and 14.\n\n"
        f"{_email_context(email)}"
    )
    msg = _client.messages.create(
        model=MODEL,
        max_tokens=5,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        days = int(msg.content[0].text.strip())
        days = max(1, min(14, days))
    except ValueError:
        days = 3
    from datetime import timedelta
    return (datetime.now() + timedelta(days=days)).date()


def save_correction(snippet: str, wrong_label: str, correct_label: str) -> None:
    """Persist a user classification correction for future few-shot prompting."""
    corrections = []
    if CORRECTIONS_FILE.exists():
        corrections = json.loads(CORRECTIONS_FILE.read_text())
    corrections.append({
        "snippet": snippet[:200],
        "wrong": wrong_label,
        "correct": correct_label,
        "timestamp": datetime.now().isoformat(),
    })
    CORRECTIONS_FILE.write_text(json.dumps(corrections, indent=2))
