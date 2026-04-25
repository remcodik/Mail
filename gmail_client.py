import base64
import re
import urllib.request
import urllib.parse
from email.mime.text import MIMEText

from googleapiclient.discovery import build

from auth import get_credentials


class GmailClient:
    def __init__(self) -> None:
        creds = get_credentials()
        self.service = build("gmail", "v1", credentials=creds)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_emails(self, query: str = "", max_results: int = 20) -> list[dict]:
        result = (
            self.service.users()
            .messages()
            .list(userId="me", q=query, maxResults=max_results)
            .execute()
        )
        messages = result.get("messages", [])
        return [self.get_email(m["id"]) for m in messages]

    def get_email(self, message_id: str) -> dict:
        msg = (
            self.service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
        return self._parse_message(msg)

    def list_sent(self, max_results: int = 20) -> list[dict]:
        return self.list_emails(query="in:sent", max_results=max_results)

    # ------------------------------------------------------------------
    # Mutate
    # ------------------------------------------------------------------

    def archive_email(self, message_id: str) -> None:
        self.service.users().messages().modify(
            userId="me", id=message_id, body={"removeLabelIds": ["INBOX"]}
        ).execute()

    def delete_email(self, message_id: str) -> None:
        self.service.users().messages().trash(userId="me", id=message_id).execute()

    def mark_read(self, message_id: str) -> None:
        self.service.users().messages().modify(
            userId="me", id=message_id, body={"removeLabelIds": ["UNREAD"]}
        ).execute()

    def apply_label(self, message_id: str, label: str) -> None:
        label_id = self._get_or_create_label(label)
        self.service.users().messages().modify(
            userId="me", id=message_id, body={"addLabelIds": [label_id]}
        ).execute()

    def create_draft(self, to: str, subject: str, body: str) -> dict:
        raw = self._encode_message(to, subject, body)
        return (
            self.service.users()
            .drafts()
            .create(userId="me", body={"message": {"raw": raw}})
            .execute()
        )

    def send_email(
        self, to: str, subject: str, body: str, thread_id: str | None = None
    ) -> dict:
        raw = self._encode_message(to, subject, body)
        payload: dict = {"raw": raw}
        if thread_id:
            payload["threadId"] = thread_id
        return (
            self.service.users().messages().send(userId="me", body=payload).execute()
        )

    def unsubscribe(self, message_id: str) -> str:
        email = self.get_email(message_id)
        header = email.get("list_unsubscribe", "")
        if not header:
            return "no_unsubscribe_header"

        urls = re.findall(r"<([^>]+)>", header)
        for url in urls:
            if url.startswith("mailto:"):
                parts = url[7:].split("?", 1)
                to = parts[0]
                subject = "Unsubscribe"
                if len(parts) > 1:
                    params = urllib.parse.parse_qs(parts[1])
                    subject = params.get("subject", ["Unsubscribe"])[0]
                self.send_email(to, subject, "Unsubscribe")
                return "unsubscribed_via_email"
            if url.startswith("http"):
                urllib.request.urlopen(url, timeout=10)  # noqa: S310
                return "unsubscribed_via_url"
        return "unknown_method"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _parse_message(self, msg: dict) -> dict:
        headers = {
            h["name"].lower(): h["value"]
            for h in msg["payload"].get("headers", [])
        }
        return {
            "id": msg["id"],
            "thread_id": msg["threadId"],
            "from": headers.get("from", ""),
            "to": headers.get("to", ""),
            "subject": headers.get("subject", ""),
            "date": headers.get("date", ""),
            "list_unsubscribe": headers.get("list-unsubscribe", ""),
            "body": self._extract_body(msg["payload"]),
            "snippet": msg.get("snippet", ""),
        }

    def _extract_body(self, payload: dict) -> str:
        if payload.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(payload["body"]["data"]).decode(
                "utf-8", errors="replace"
            )
        for mime in ("text/plain", "text/html"):
            for part in payload.get("parts", []):
                if part["mimeType"] == mime and part.get("body", {}).get("data"):
                    return base64.urlsafe_b64decode(part["body"]["data"]).decode(
                        "utf-8", errors="replace"
                    )
                if part["mimeType"].startswith("multipart"):
                    result = self._extract_body(part)
                    if result:
                        return result
        return ""

    def _encode_message(self, to: str, subject: str, body: str) -> str:
        msg = MIMEText(body)
        msg["to"] = to
        msg["subject"] = subject
        return base64.urlsafe_b64encode(msg.as_bytes()).decode()

    def _get_or_create_label(self, name: str) -> str:
        labels = (
            self.service.users().labels().list(userId="me").execute()
        ).get("labels", [])
        for label in labels:
            if label["name"].lower() == name.lower():
                return label["id"]
        created = (
            self.service.users()
            .labels()
            .create(userId="me", body={"name": name})
            .execute()
        )
        return created["id"]
