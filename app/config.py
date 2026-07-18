"""Central configuration for the MailAI backend.

All secrets come from the environment (never hardcode). In `demo` mode the app
runs with seeded data and no external calls, so it is fully testable without any
credentials. Set MAILAI_MODE=live plus the Google/Anthropic vars to use real
Gmail and Claude.
"""
from __future__ import annotations
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mode: str                       # "demo" | "live"
    session_secret: str
    # Claude models — "best value": a fast model for classification, a stronger
    # one for summaries/drafts. Verify IDs against the current model list.
    model_classify: str
    model_reason: str
    anthropic_api_key: str | None
    google_client_id: str | None
    google_client_secret: str | None
    oauth_redirect_base: str        # public base URL for OAuth redirect URIs
    owner_email: str | None         # if set, only this Google account may sign in

    @property
    def is_live(self) -> bool:
        return self.mode == "live"

    @property
    def cookie_secure(self) -> bool:
        return self.oauth_redirect_base.lower().startswith("https")


def load_settings() -> Settings:
    mode = os.getenv("MAILAI_MODE", "demo").strip().lower()
    return Settings(
        mode=mode,
        session_secret=os.getenv("MAILAI_SESSION_SECRET", "dev-insecure-secret-change-me"),
        model_classify=os.getenv("MAILAI_MODEL_CLASSIFY", "claude-haiku-4-5-20251001"),
        model_reason=os.getenv("MAILAI_MODEL_REASON", "claude-sonnet-5"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
        google_client_id=os.getenv("GOOGLE_CLIENT_ID"),
        google_client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        oauth_redirect_base=os.getenv("MAILAI_OAUTH_REDIRECT_BASE", "http://localhost:8000"),
        owner_email=(os.getenv("MAILAI_OWNER_EMAIL") or None),
    )


settings = load_settings()
