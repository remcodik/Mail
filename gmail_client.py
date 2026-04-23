"""Gmail API wrapper — multi-account aware."""

from __future__ import annotations

import base64
import email as email_lib
from typing import Any

from googleapiclient.discovery import build

from auth import get_credentials


class GmailClient:
    def __init__(self, account_email: str) -> None:
        self.account_email = account_email
        creds = get_credentials(account_email)
        self._svc = build("gmail", "v1", credentials=creds)

    def _users(self):
        return self._svc.users()

    # ── listing ──────────────────────────────────────────────────────────────

    def list_emails(self, query: str = "", max_results: int = 20) -> list[dict]:
        result = (
            self._users()
            .messages()
            .list(userId="me", q=query, maxResults=max_results)
            .execute()
        )
        messages = result.get("messages", [])
        return [self.get_email(m["id"]) for m in messages]

    def list_sent(self, max_results: int = 20) -> list[dict]:
        return self.list_emails(query="in:sent", max_results=max_results)

    # ── single email ─────────────────────────────────────────────────────────

    def get_email(self, message_id: str) -> dict:
        msg = (
            self._users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
        return self._parse(msg)

    def _parse(self, msg: dict) -> dict:
        headers = {
            h["name"].lower(): h["value"]
            for h in msg.get("payload", {}).get("headers", [])
        }
        body = self._extract_body(msg.get("payload", {}))
        return {
            "id": msg["id"],
            "thread_id": msg.get("threadId", ""),
            "account": self.account_email,
            "from": headers.get("from", ""),
            "to": headers.get("to", ""),
            "subject": headers.get("subject", "(no subject)"),
            "date": headers.get("date", ""),
            "list_unsubscribe": headers.get("list-unsubscribe", ""),
            "snippet": msg.get("snippet", ""),
            "body": body,
            "labels": msg.get("labelIds", []),
        }

    def _extract_body(self, payload: dict) -> str:
        if "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain":
                    data = part.get("body", {}).get("data", "")
                    if data:
                        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            # fallback to first part
            for part in payload["parts"]:
                text = self._extract_body(part)
                if text:
                    return text
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
        return ""

    # ── actions ───────────────────────────────────────────────────────────────

    def archive_email(self, message_id: str) -> None:
        self._users().messages().modify(
            userId="me",
            id=message_id,
            body={"removeLabelIds": ["INBOX"]},
        ).execute()

    def delete_email(self, message_id: str) -> None:
        self._users().messages().trash(userId="me", id=message_id).execute()

    def mark_read(self, message_id: str) -> None:
        self._users().messages().modify(
            userId="me",
            id=message_id,
            body={"removeLabelIds": ["UNREAD"]},
        ).execute()

    def apply_label(self, message_id: str, label: str) -> None:
        label_id = self._get_or_create_label(label)
        self._users().messages().modify(
            userId="me",
            id=message_id,
            body={"addLabelIds": [label_id]},
        ).execute()

    def create_draft(self, to: str, subject: str, body: str) -> dict:
        message = self._build_message(to, subject, body)
        return (
            self._users().drafts().create(userId="me", body={"message": message}).execute()
        )

    def send_email(
        self, to: str, subject: str, body: str, thread_id: str | None = None
    ) -> dict:
        message = self._build_message(to, subject, body, thread_id)
        return self._users().messages().send(userId="me", body=message).execute()

    def unsubscribe(self, message_id: str) -> str:
        """Attempt to unsubscribe via List-Unsubscribe header. Returns action taken."""
        import urllib.request

        email = self.get_email(message_id)
        header = email.get("list_unsubscribe", "")
        if not header:
            return "no_header"

        # prefer mailto:
        for part in header.split(","):
            part = part.strip().strip("<>")
            if part.startswith("mailto:"):
                addr = part[7:].split("?")[0]
                self.send_email(addr, "Unsubscribe", "")
                return f"mailto:{addr}"
            if part.startswith("https://"):
                try:
                    urllib.request.urlopen(part, timeout=10)
                except Exception:
                    pass
                return f"https:{part}"

        return "not_handled"

    # ── helpers ───────────────────────────────────────────────────────────────

    def _build_message(
        self, to: str, subject: str, body: str, thread_id: str | None = None
    ) -> dict:
        import email as em
        from email.mime.text import MIMEText

        msg = MIMEText(body)
        msg["to"] = to
        msg["from"] = self.account_email
        msg["subject"] = subject
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        result: dict[str, Any] = {"raw": raw}
        if thread_id:
            result["threadId"] = thread_id
        return result

    def _get_or_create_label(self, name: str) -> str:
        labels = self._users().labels().list(userId="me").execute().get("labels", [])
        for label in labels:
            if label["name"].lower() == name.lower():
                return label["id"]
        created = (
            self._users()
            .labels()
            .create(userId="me", body={"name": name})
            .execute()
        )
        return created["id"]
