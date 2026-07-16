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

    # --- read (TODO Sprint 2b: implement against self._service()) ---
    def list_messages(self, query: str = "", max_results: int = 25) -> list[dict]:
        raise NotConfigured("list_messages not implemented yet (#29)")

    def get_message(self, message_id: str) -> dict:
        raise NotConfigured("get_message not implemented yet (#29)")

    # --- actions (suggestion-only until confirmed by the user) ---
    def archive(self, message_id: str) -> None:
        raise NotConfigured("archive not implemented yet (#29)")

    def apply_label(self, message_id: str, label: str) -> None:
        raise NotConfigured("apply_label not implemented yet (#29)")
