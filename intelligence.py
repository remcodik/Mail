"""All Claude API calls — single entry point for AI logic."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-6"

CORRECTIONS_FILE = Path("data/corrections.json")

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

# ── system prompt (cached) ────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an AI email assistant. You classify, summarize, and extract information
from emails accurately and concisely. Always respond with valid JSON when asked.

Email categories:
- urgent: needs immediate attention, time-sensitive
- reply_needed: sender expects a response
- newsletter: marketing, subscription content
- junk: spam, unsolicited
- fyi: informational, no action required
- ticket: event ticket, boarding pass, receipt, reservation confirmation
- awaiting_reply: sent email with an open request (used for sent mail)
- scheduling: contains meeting / appointment proposal or request
"""


def _recent_corrections() -> str:
    if not CORRECTIONS_FILE.exists():
        return ""
    with open(CORRECTIONS_FILE) as f:
        corrections = json.load(f)
    if not corrections:
        return ""
    recent = corrections[-10:]
    lines = ["Recent user corrections (use as examples):"]
    for c in recent:
        lines.append(
            f'  Snippet: "{c["snippet"]}" → was "{c["wrong"]}", correct: "{c["correct"]}"'
        )
    return "\n".join(lines)


def _email_text(email: dict) -> str:
    return (
        f"From: {email.get('from', '')}\n"
        f"Subject: {email.get('subject', '')}\n"
        f"Date: {email.get('date', '')}\n\n"
        f"{email.get('body', email.get('snippet', ''))[:3000]}"
    )


def _call(system_extra: str, user_content: str) -> str:
    system = _SYSTEM_PROMPT
    if system_extra:
        system += "\n\n" + system_extra
    response = _client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip()


# ── public functions ──────────────────────────────────────────────────────────

def classify_email(email: dict) -> str:
    corrections = _recent_corrections()
    raw = _call(
        corrections,
        f"Classify this email into exactly one category from {CATEGORIES}.\n"
        f"Respond with JSON: {{\"category\": \"<name>\"}}\n\n"
        f"{_email_text(email)}",
    )
    try:
        return json.loads(raw)["category"]
    except Exception:
        return "fyi"


def summarize_thread(messages: list[dict]) -> str:
    combined = "\n---\n".join(_email_text(m) for m in messages[:5])
    return _call(
        "",
        f"Summarize this email thread in 2-3 sentences for a busy person.\n\n{combined}",
    )


def extract_tasks(email: dict) -> list[dict]:
    raw = _call(
        "",
        f"Extract action items from this email as JSON array: "
        f'[{{"task": "...", "due_date": "YYYY-MM-DD or null"}}]\n\n'
        f"Return [] if none.\n\n{_email_text(email)}",
    )
    try:
        return json.loads(raw)
    except Exception:
        return []


def draft_reply(email: dict, tone: str = "professional") -> str:
    return _call(
        "",
        f"Draft a {tone} reply to this email. Be concise and helpful.\n\n"
        f"{_email_text(email)}",
    )


def detect_ticket(email: dict) -> dict | None:
    raw = _call(
        "",
        f"Does this email contain a ticket, boarding pass, receipt, or reservation?\n"
        f"If yes, respond with JSON: "
        f'{{\"type\": "event|boarding|receipt|reservation", \"event\": "...", '
        f'"date": "...", "seat": "...", "barcode_url": "..."}}\n'
        f'If no, respond with {{"ticket": false}}\n\n{_email_text(email)}',
    )
    try:
        data = json.loads(raw)
        if data.get("ticket") is False:
            return None
        return data
    except Exception:
        return None


def detect_scheduling_intent(email: dict) -> bool:
    raw = _call(
        "",
        f'Does this email involve scheduling a meeting or appointment?\n'
        f'Respond with JSON: {{"scheduling": true}} or {{"scheduling": false}}\n\n'
        f"{_email_text(email)}",
    )
    try:
        return json.loads(raw).get("scheduling", False)
    except Exception:
        return False


def detect_request_in_sent(email: dict) -> bool:
    raw = _call(
        "",
        f"Does this sent email contain an open request or question that needs a reply?\n"
        f'Respond with JSON: {{"has_request": true}} or {{"has_request": false}}\n\n'
        f"{_email_text(email)}",
    )
    try:
        return json.loads(raw).get("has_request", False)
    except Exception:
        return False


def generate_appointment_proposal(email: dict) -> str:
    return _call(
        "",
        f"Write a polite reply proposing 3 time slots for a meeting mentioned in this email. "
        f"Use placeholder times like 'Monday 10:00–11:00', 'Tuesday 14:00–15:00', "
        f"'Wednesday 11:00–12:00'. Be brief.\n\n{_email_text(email)}",
    )


def suggest_followup_date(email: dict) -> str:
    raw = _call(
        "",
        f"Today is {date.today().isoformat()}. "
        f"When should the sender follow up if no reply arrives? "
        f'Respond with JSON: {{"followup_date": "YYYY-MM-DD"}}\n\n{_email_text(email)}',
    )
    try:
        return json.loads(raw)["followup_date"]
    except Exception:
        from datetime import timedelta
        return (date.today() + timedelta(days=3)).isoformat()


# ── correction loop ───────────────────────────────────────────────────────────

def save_correction(email: dict, wrong_label: str, correct_label: str) -> None:
    CORRECTIONS_FILE.parent.mkdir(exist_ok=True)
    corrections = []
    if CORRECTIONS_FILE.exists():
        with open(CORRECTIONS_FILE) as f:
            corrections = json.load(f)
    corrections.append(
        {
            "snippet": email.get("snippet", "")[:120],
            "wrong": wrong_label,
            "correct": correct_label,
        }
    )
    with open(CORRECTIONS_FILE, "w") as f:
        json.dump(corrections[-100:], f, indent=2)  # keep last 100
