"""Sessions + OAuth connect (multi-user, multi-account).

Demo mode: everyone is the seeded `demo-user` (no login needed) so the app is
testable without secrets. Live mode: a signed cookie carries the `user_id`, and
connecting a Gmail account runs Google OAuth, storing one token per
(user_id, account_id). The OAuth exchange itself is scaffolded for Sprint 2b (#29).
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
from .config import settings

DEMO_USER = "demo-user"
COOKIE = "mailai_session"


def _sign(payload: str) -> str:
    sig = hmac.new(settings.session_secret.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def make_session(user_id: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"uid": user_id}).encode()).decode().rstrip("=")
    return f"{body}.{_sign(body)}"


def read_session(cookie: str | None) -> str | None:
    if not cookie or "." not in cookie:
        return None
    body, sig = cookie.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(body)):
        return None
    try:
        pad = "=" * (-len(body) % 4)
        return json.loads(base64.urlsafe_b64decode(body + pad)).get("uid")
    except Exception:
        return None


def current_user(cookie: str | None) -> str | None:
    """Resolve the authenticated user id. Demo mode short-circuits to DEMO_USER."""
    if not settings.is_live:
        return DEMO_USER
    return read_session(cookie)


# ---- OAuth connect (Google) — scaffold for #29 ----
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.email",
]


def authorize_url(state: str) -> str:
    if not settings.is_live or not settings.google_client_id:
        raise RuntimeError("Google OAuth not configured (set GOOGLE_CLIENT_ID/SECRET, MAILAI_MODE=live).")
    from urllib.parse import urlencode
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.oauth_redirect_base}/api/accounts/callback",
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
