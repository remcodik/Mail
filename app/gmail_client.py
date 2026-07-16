"""Gmail access, scoped to a single (user, account) — never mixes accounts.

Scaffold: the demo path needs no Gmail. The live path uses the Gmail API with a
per-account OAuth token (see auth.py). Methods raise NotConfigured until live
credentials + a stored token are wired in (Sprint 2b, issue #29).
"""
from __future__ import annotations
from .config import settings


class NotConfigured(RuntimeError):
    pass


class GmailClient:
    def __init__(self, user_id: str, account_id: str, token: dict | None = None):
        self.user_id = user_id
        self.account_id = account_id
        self._token = token

    def _service(self):
        if not settings.is_live or not self._token:
            raise NotConfigured("Gmail is only available in live mode with a connected account token.")
        # Lazy import so demo mode needs no google deps.
        from googleapiclient.discovery import build           # type: ignore
        from google.oauth2.credentials import Credentials     # type: ignore
        creds = Credentials(**self._token)
        return build("gmail", "v1", credentials=creds, cache_discovery=False)

    # --- read ---
    def list_message_ids(self, query: str = "in:inbox", max_results: int = 25) -> list[str]:
        svc = self._service()
        res = svc.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
        return [m["id"] for m in res.get("messages", [])]

    def get_message(self, message_id: str) -> dict:
        """Return a normalized email dict for the sync pipeline."""
        svc = self._service()
        raw = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
        headers = {h["name"].lower(): h["value"] for h in raw.get("payload", {}).get("headers", [])}
        sender = headers.get("from", "")
        name = _display_name(sender)
        return {
            "id": message_id,
            "account": self.account_id,
            "from": name,
            "initials": _initials(name),
            "av": _color_for(name),
            "subject": headers.get("subject", "(no subject)"),
            "snippet": raw.get("snippet", ""),
            "body": _extract_body(raw.get("payload", {})),
            "time": _short_time(headers.get("date", "")),
            "gmail_labels": raw.get("labelIds", []),
        }

    # --- actions (suggestion-only; called after explicit user confirmation) ---
    def archive(self, message_id: str) -> None:
        self._service().users().messages().modify(
            userId="me", id=message_id, body={"removeLabelIds": ["INBOX"]}).execute()

    def apply_label(self, message_id: str, label_id: str) -> None:
        self._service().users().messages().modify(
            userId="me", id=message_id, body={"addLabelIds": [label_id]}).execute()


# ---- parsing helpers ----
def _display_name(sender: str) -> str:
    # "Jane Doe <jane@x.com>" -> "Jane Doe"; "jane@x.com" -> "jane"
    sender = (sender or "").strip()
    if "<" in sender:
        return sender.split("<", 1)[0].strip().strip('"') or sender
    if "@" in sender:
        return sender.split("@", 1)[0]
    return sender or "Unknown"


def _initials(name: str) -> str:
    parts = [p for p in name.replace(".", " ").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _color_for(name: str) -> str:
    palette = ["#E5484D", "#E8912B", "#3E7BF0", "#8257E6", "#0E7C86",
               "#D6336C", "#2E9E5B", "#0EA5E9", "#B45309", "#5B34C9"]
    h = 0
    for ch in name:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return palette[h % len(palette)]


def _extract_body(payload: dict) -> str:
    import base64
    def walk(part):
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", "replace")
        for p in part.get("parts", []) or []:
            t = walk(p)
            if t:
                return t
        return ""
    return walk(payload)[:4000]


def _short_time(date_header: str) -> str:
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(date_header).strftime("%H:%M")
    except Exception:
        return ""
