"""Gmail API wrapper providing typed helpers for all mail operations."""

import base64
import email as email_lib
from typing import Any

from googleapiclient.discovery import build

from auth import get_credentials


def _service():
    return build("gmail", "v1", credentials=get_credentials())


def _decode_body(payload: dict) -> str:
    """Recursively extract plain-text body from a message payload."""
    mime_type = payload.get("mimeType", "")
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    if mime_type.startswith("multipart/"):
        for part in payload.get("parts", []):
            text = _decode_body(part)
            if text:
                return text
    return ""


def _parse_message(msg: dict) -> dict:
    """Convert a raw Gmail message dict into a clean dict."""
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    return {
        "id": msg["id"],
        "thread_id": msg.get("threadId", ""),
        "subject": headers.get("subject", "(no subject)"),
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "date": headers.get("date", ""),
        "list_unsubscribe": headers.get("list-unsubscribe", ""),
        "snippet": msg.get("snippet", ""),
        "body": _decode_body(msg.get("payload", {})),
        "labels": msg.get("labelIds", []),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def list_emails(query: str = "in:inbox", max_results: int = 20) -> list[dict]:
    svc = _service()
    resp = svc.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
    messages = resp.get("messages", [])
    result = []
    for m in messages:
        full = svc.users().messages().get(userId="me", id=m["id"], format="full").execute()
        result.append(_parse_message(full))
    return result


def get_email(message_id: str) -> dict:
    svc = _service()
    msg = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
    return _parse_message(msg)


def get_thread(thread_id: str) -> list[dict]:
    svc = _service()
    thread = svc.users().threads().get(userId="me", id=thread_id, format="full").execute()
    return [_parse_message(m) for m in thread.get("messages", [])]


def archive_email(message_id: str) -> None:
    svc = _service()
    svc.users().messages().modify(
        userId="me", id=message_id, body={"removeLabelIds": ["INBOX"]}
    ).execute()


def delete_email(message_id: str) -> None:
    svc = _service()
    svc.users().messages().trash(userId="me", id=message_id).execute()


def apply_label(message_id: str, label: str) -> None:
    """Apply a label by name, creating it if it doesn't exist."""
    svc = _service()
    labels_resp = svc.users().labels().list(userId="me").execute()
    existing = {l["name"]: l["id"] for l in labels_resp.get("labels", [])}
    if label not in existing:
        created = svc.users().labels().create(userId="me", body={"name": label}).execute()
        label_id = created["id"]
    else:
        label_id = existing[label]
    svc.users().messages().modify(
        userId="me", id=message_id, body={"addLabelIds": [label_id]}
    ).execute()


def create_draft(to: str, subject: str, body: str, thread_id: str | None = None) -> dict:
    svc = _service()
    message = email_lib.message.EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft_body: dict[str, Any] = {"message": {"raw": raw}}
    if thread_id:
        draft_body["message"]["threadId"] = thread_id
    return svc.users().drafts().create(userId="me", body=draft_body).execute()


def send_email(to: str, subject: str, body: str, thread_id: str | None = None) -> dict:
    svc = _service()
    message = email_lib.message.EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    msg_body: dict[str, Any] = {"raw": raw}
    if thread_id:
        msg_body["threadId"] = thread_id
    return svc.users().messages().send(userId="me", body=msg_body).execute()


def mark_read(message_id: str) -> None:
    svc = _service()
    svc.users().messages().modify(
        userId="me", id=message_id, body={"removeLabelIds": ["UNREAD"]}
    ).execute()


def list_sent(max_results: int = 20) -> list[dict]:
    return list_emails(query="in:sent", max_results=max_results)


def unsubscribe(list_unsubscribe_header: str) -> str:
    """Parse List-Unsubscribe header and perform the unsubscribe action.

    Returns a human-readable status string.
    """
    import re
    import requests

    mailto = re.search(r"<mailto:([^>]+)>", list_unsubscribe_header)
    https = re.search(r"<(https?://[^>]+)>", list_unsubscribe_header)

    if mailto:
        addr, _, params = mailto.group(1).partition("?")
        subject = "Unsubscribe"
        for param in params.split("&"):
            if param.lower().startswith("subject="):
                subject = param.split("=", 1)[1]
        send_email(to=addr, subject=subject, body="Unsubscribe")
        return f"Unsubscribe email sent to {addr}"

    if https:
        url = https.group(1)
        resp = requests.get(url, timeout=10)
        return f"Unsubscribe URL called: {url} — status {resp.status_code}"

    return "No valid unsubscribe method found in header"
