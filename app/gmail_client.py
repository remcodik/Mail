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
        addr = _email_addr(sender)
        return {
            "id": message_id,
            "account": self.account_id,
            "from": name,
            "email": addr,
            "domain": addr.split("@", 1)[1] if "@" in addr else "",
            "initials": _initials(name),
            "av": _color_for(name),
            "subject": headers.get("subject", "(no subject)"),
            "snippet": raw.get("snippet", ""),
            "body": _extract_body(raw.get("payload", {})),
            "time": _short_time(headers.get("date", "")),
            "date": _short_date(headers.get("date", "")),
            "gmail_labels": raw.get("labelIds", []),
            "isUnread": "UNREAD" in raw.get("labelIds", []),
        }

    def get_when(self, message_id: str) -> tuple[str, str]:
        """(date, time) strings from a message's Date header only — a cheap
        metadata fetch used to repair older stored mail that predates these
        fields. Empty strings on failure."""
        raw = self._service().users().messages().get(
            userId="me", id=message_id, format="metadata", metadataHeaders=["Date"]).execute()
        hdr = ""
        for h in raw.get("payload", {}).get("headers", []):
            if h.get("name", "").lower() == "date":
                hdr = h.get("value", "")
                break
        return _short_date(hdr), _short_time(hdr)

    def get_html(self, message_id: str) -> str:
        """Fetch a message's rich HTML body on demand (not stored — kept out of
        the per-user blob so storage stays small). Falls back to the plain text
        wrapped in <pre> if the mail has no HTML part."""
        svc = self._service()
        raw = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
        payload = raw.get("payload", {})
        html = _extract_html(payload)
        if html:
            return html
        text = _extract_body(payload)
        import html as _h
        return "<pre style='white-space:pre-wrap;font:inherit'>" + _h.escape(text) + "</pre>"

    # --- actions (suggestion-only; called after explicit user confirmation) ---
    def archive(self, message_id: str) -> None:
        self._service().users().messages().modify(
            userId="me", id=message_id, body={"removeLabelIds": ["INBOX"]}).execute()

    def apply_label(self, message_id: str, label_id: str) -> None:
        self._service().users().messages().modify(
            userId="me", id=message_id, body={"addLabelIds": [label_id]}).execute()

    def remove_label(self, message_id: str, label_id: str) -> None:
        self._service().users().messages().modify(
            userId="me", id=message_id, body={"removeLabelIds": [label_id]}).execute()

    def get_amount_images(self, message_id: str, max_images: int = 3, max_bytes: int = 3_000_000) -> list[dict]:
        """Fetch a few inline/attached images from a mail (receipts/invoices),
        as standard-base64 for Claude vision. Skips huge images; capped in count."""
        import base64
        svc = self._service()
        raw = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
        out: list[dict] = []

        def walk(part):
            if len(out) >= max_images:
                return
            mime = part.get("mimeType", "")
            body = part.get("body", {})
            if mime in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"):
                data = body.get("data")
                if not data and body.get("attachmentId"):
                    att = svc.users().messages().attachments().get(
                        userId="me", messageId=message_id, id=body["attachmentId"]).execute()
                    data = att.get("data")
                if data:
                    rawb = base64.urlsafe_b64decode(data)
                    if len(rawb) <= max_bytes:
                        out.append({"mime": "image/jpeg" if mime == "image/jpg" else mime,
                                    "data": base64.b64encode(rawb).decode()})
            for p in part.get("parts", []) or []:
                walk(p)

        walk(raw.get("payload", {}))
        return out

    @staticmethod
    def fetch_html_images(html: str, max_images: int = 3, max_bytes: int = 3_000_000) -> list[dict]:
        """Fetch a few remote-hosted images referenced in the HTML (<img src="http…">)
        as base64 for Claude vision. Many receipts/invoices (e.g. energy annual
        statements) put the total inside a banner image loaded from a URL, so it
        never appears as a MIME part or as text. Server-side only; capped and
        best-effort (network/host errors are ignored)."""
        import re, base64, urllib.request
        out: list[dict] = []
        urls, seen = [], set()
        for m in re.finditer(r'<img[^>]+src\s*=\s*["\']?(https?://[^"\'\s>]+)', html or "", re.I):
            u = m.group(1)
            if u not in seen:
                seen.add(u)
                urls.append(u)
        for u in urls:
            if len(out) >= max_images:
                break
            try:
                req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                    if ctype not in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"):
                        continue
                    rawb = resp.read(max_bytes + 1)
                if not rawb or len(rawb) > max_bytes or len(rawb) < 1500:   # skip tracking pixels
                    continue
                out.append({"mime": "image/jpeg" if ctype == "image/jpg" else ctype,
                            "data": base64.b64encode(rawb).decode()})
            except Exception:
                continue
        return out

    def set_unread(self, message_id: str, unread: bool) -> None:
        body = {"addLabelIds": ["UNREAD"]} if unread else {"removeLabelIds": ["UNREAD"]}
        self._service().users().messages().modify(userId="me", id=message_id, body=body).execute()

    def ensure_label(self, name: str) -> str:
        """Return the Gmail label id for `name` (e.g. "MailAI/Urgent"), creating it
        — and any parent like "MailAI" — if it doesn't exist yet. Nesting is by "/"."""
        svc = self._service()
        existing = {l["name"]: l["id"] for l in
                    svc.users().labels().list(userId="me").execute().get("labels", [])}
        if name in existing:
            return existing[name]
        # create parents first so Gmail nests the label under a collapsible "MailAI/"
        parts = name.split("/")
        label_id = ""
        for i in range(len(parts)):
            path = "/".join(parts[: i + 1])
            if path in existing:
                label_id = existing[path]
                continue
            created = svc.users().labels().create(userId="me", body={
                "name": path,
                "labelListVisibility": "labelShow",
                "messageListVisibility": "show",
            }).execute()
            existing[path] = created["id"]
            label_id = created["id"]
        return label_id


# ---- parsing helpers ----
def _display_name(sender: str) -> str:
    # "Jane Doe <jane@x.com>" -> "Jane Doe"; "jane@x.com" -> "jane"
    sender = (sender or "").strip()
    if "<" in sender:
        return sender.split("<", 1)[0].strip().strip('"') or sender
    if "@" in sender:
        return sender.split("@", 1)[0]
    return sender or "Unknown"


def _email_addr(sender: str) -> str:
    # "Jane Doe <jane@x.com>" -> "jane@x.com"; "jane@x.com" -> "jane@x.com"
    sender = (sender or "").strip()
    if "<" in sender and ">" in sender:
        return sender.split("<", 1)[1].split(">", 1)[0].strip().lower()
    return sender.lower() if "@" in sender else ""


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


def _extract_html(payload: dict) -> str:
    """Return the first text/html part, base64-decoded. Empty if none."""
    import base64
    def walk(part):
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", "replace")
        for p in part.get("parts", []) or []:
            t = walk(p)
            if t:
                return t
        return ""
    return walk(payload)


def _amsterdam(date_header: str):
    """Parse a Date header and convert it to Europe/Amsterdam local time so the
    UI shows times in the user's zone (falls back to the parsed time as-is)."""
    from email.utils import parsedate_to_datetime
    from datetime import timezone
    dt = parsedate_to_datetime(date_header)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        from zoneinfo import ZoneInfo
        return dt.astimezone(ZoneInfo("Europe/Amsterdam"))
    except Exception:
        return dt


def _short_time(date_header: str) -> str:
    try:
        return _amsterdam(date_header).strftime("%H:%M")
    except Exception:
        return ""


def _short_date(date_header: str) -> str:
    """Compact day+month for the mail list, e.g. '25 Jul' (Amsterdam time)."""
    try:
        return _amsterdam(date_header).strftime("%d %b").lstrip("0")
    except Exception:
        return ""
