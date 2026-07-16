"""MailAI backend — FastAPI app.

Serves the `ui/` single-page app and a JSON API. In demo mode it runs with
seeded data and no secrets (testable anywhere). Multi-user: every request is
scoped to the authenticated `user_id`; multi-account: data stays separated by
`account_id`, aggregated only when account=all.
"""
from __future__ import annotations
import os
import secrets
from fastapi import FastAPI, Request, HTTPException, Body
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .store import store
from . import auth

app = FastAPI(title="MailAI", version="0.2.0")
UI_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ui")


@app.on_event("startup")
def _startup() -> None:
    # In demo mode, seed the demo tenant so the API has data immediately.
    if not settings.is_live:
        store.ensure_user(auth.DEMO_USER, email="dik.remco@gmail.com")


def _uid(request: Request) -> str:
    uid = auth.current_user(request.cookies.get(auth.COOKIE))
    if not uid:
        raise HTTPException(status_code=401, detail="not authenticated")
    # Ensure a tenant bucket exists (seeded in demo, empty in live until sync).
    try:
        store.profile(uid)
    except KeyError:
        store.ensure_user(uid, seed=not settings.is_live)
    return uid


# ---------------- API ----------------
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mode": settings.mode}


@app.get("/api/me")
def me(request: Request) -> dict:
    uid = _uid(request)
    return {"user": store.profile(uid), "mode": settings.mode}


@app.get("/api/inbox")
def inbox(request: Request, account: str = "all") -> dict:
    """Full per-user dataset (accounts + categories + messages), optionally
    filtered to one account. The UI can filter client-side too."""
    uid = _uid(request)
    return store.inbox(uid, account=account)


@app.post("/api/messages/{message_id}/archive")
def archive(request: Request, message_id: str) -> dict:
    uid = _uid(request)
    if not store.archive_message(uid, message_id):
        raise HTTPException(status_code=404, detail="message not found")
    return {"ok": True}


@app.post("/api/categories/{category_id}/visibility")
def set_visibility(request: Request, category_id: str, visible: bool = Body(embed=True)) -> dict:
    uid = _uid(request)
    if not store.set_category_visible(uid, category_id, visible):
        raise HTTPException(status_code=404, detail="category not found")
    return {"ok": True}


@app.post("/api/accounts/connect")
def connect_account(request: Request, name: str = Body(""), email: str = Body("")) -> dict:
    """Demo: add a fake account instantly. Live: return a Google OAuth URL (#29)."""
    uid = _uid(request)
    if settings.is_live:
        state = secrets.token_urlsafe(16)  # TODO persist state->uid (#29)
        return {"authorize_url": auth.authorize_url(state)}
    palette = ["#8257E6", "#EA580C", "#D6336C", "#0891B2", "#059669"]
    n = len(store.accounts(uid))
    acct = {"id": f"acct{n}", "name": name or (email.split('@')[0] if email else f"Account {n+1}"),
            "email": email or f"account{n+1}@example.com", "color": palette[n % len(palette)]}
    store.add_account(uid, acct)
    return {"ok": True, "account": acct}


# ---------------- static SPA (mounted last so /api wins) ----------------
if os.path.isdir(UI_DIR):
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")


@app.exception_handler(404)
async def spa_fallback(request: Request, exc):  # noqa: ANN001
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "not found"}, status_code=404)
    index = os.path.join(UI_DIR, "index.html")
    if os.path.isfile(index):
        return RedirectResponse("/")
    return JSONResponse({"detail": "ui not built"}, status_code=404)
