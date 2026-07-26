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

app = FastAPI(title="MailAI", version="0.3.0")
UI_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ui")
_OAUTH_STATES: dict[str, str] = {}  # state -> user_id (dev store; use a real cache in prod)
_ACCT_PALETTE = ["#3E7BF0", "#0FA398", "#8257E6", "#EA580C", "#D6336C", "#0891B2"]


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


_LOGIN_INTENT = "__login__"


@app.get("/api/login")
def login(request: Request):
    """Start 'Sign in with Google'. Demo needs no login. Live: send the browser to
    Google; the callback establishes identity (your email = your account)."""
    if not settings.is_live:
        return RedirectResponse("/")
    state = secrets.token_urlsafe(16)
    _OAUTH_STATES[state] = _LOGIN_INTENT
    return RedirectResponse(auth.authorize_url(state))


@app.get("/api/logout")
def logout():
    resp = RedirectResponse("/")
    resp.delete_cookie(auth.COOKIE)
    return resp


def _connect_mailbox(uid: str, token: dict) -> str:
    """Add the Gmail account behind `token` to `uid`, store the token, sync it."""
    email = auth.fetch_email(token["token"]) or "account@gmail.com"
    account_id = email  # stable per-account id
    n = len(store.accounts(uid))
    store.add_account(uid, {"id": account_id, "name": email.split("@")[0].title(),
                            "email": email, "color": _ACCT_PALETTE[n % len(_ACCT_PALETTE)]})
    store.set_token(uid, account_id, token)
    try:
        from .orchestrator import process_account
        process_account(uid, account_id)
    except Exception:  # a sync hiccup must not block the redirect back to the app
        pass
    return email


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


@app.post("/api/messages/{message_id}/restore")
def restore(request: Request, message_id: str) -> dict:
    uid = _uid(request)
    if not store.restore_message(uid, message_id):
        raise HTTPException(status_code=404, detail="message not found")
    return {"ok": True}


@app.post("/api/messages/{message_id}/delete")
def delete_message(request: Request, message_id: str) -> dict:
    uid = _uid(request)
    if not store.delete_message(uid, message_id):
        raise HTTPException(status_code=404, detail="message not found")
    return {"ok": True}


@app.post("/api/messages/{message_id}/read")
def set_read(request: Request, message_id: str, unread: bool = Body(False, embed=True)) -> dict:
    """Mark a message read (unread=false) or unread (unread=true). Mirrors to
    Gmail's UNREAD label when live + a token is present."""
    uid = _uid(request)
    if not store.set_unread(uid, message_id, unread):
        raise HTTPException(status_code=404, detail="message not found")
    if settings.is_live:
        msg = next((m for m in store.messages(uid, include_archived=True) if m["id"] == message_id), None)
        token = store.get_token(uid, msg.get("account")) if msg else None
        if token:
            try:
                from .gmail_client import GmailClient
                GmailClient(uid, msg["account"], token).set_unread(message_id, unread)
            except Exception:
                pass
    return {"ok": True, "unread": bool(unread)}


@app.post("/api/messages/{message_id}/snooze")
def snooze(request: Request, message_id: str,
           until: str = Body("", embed=True), bucket: int = Body(9, embed=True)) -> dict:
    uid = _uid(request)
    if not store.snooze_message(uid, message_id, until, int(bucket)):
        raise HTTPException(status_code=404, detail="message not found")
    return {"ok": True}


@app.post("/api/categories/{category_id}/visibility")
def set_visibility(request: Request, category_id: str, visible: bool = Body(embed=True)) -> dict:
    uid = _uid(request)
    if not store.set_category_visible(uid, category_id, visible):
        raise HTTPException(status_code=404, detail="category not found")
    return {"ok": True}


@app.post("/api/settings/mirror")
def set_mirror(request: Request, enabled: bool = Body(embed=True)) -> dict:
    """Toggle 'mirror categories + labels to Gmail' for the user. When on, syncs
    write each mail's category (main label) and labels into Gmail under MailAI/."""
    uid = _uid(request)
    store.set_setting(uid, "mirror_gmail", bool(enabled))
    return {"ok": True, "mirror_gmail": bool(enabled)}


@app.post("/api/settings/lang")
def set_lang(request: Request, lang: str = Body(embed=True)) -> dict:
    """Set the UI language ('en' | 'nl'). Only affects MailAI's own chrome."""
    uid = _uid(request)
    lang = "nl" if str(lang).lower().startswith("nl") else "en"
    store.set_setting(uid, "lang", lang)
    return {"ok": True, "lang": lang}


@app.post("/api/messages/{message_id}/amount")
def message_amount(request: Request, message_id: str) -> dict:
    """Detect the € total for a receipt/invoice mail — text first, then its
    images via vision — and cache it on the message. Live only."""
    uid = _uid(request)
    msg = next((m for m in store.messages(uid, include_archived=True) if m["id"] == message_id), None)
    if not msg:
        raise HTTPException(status_code=404, detail="message not found")
    amount = 0.0
    direction = ""
    if settings.is_live:
        token = store.get_token(uid, msg.get("account"))
        if token:
            try:
                import re
                from .gmail_client import GmailClient
                from .intelligence import read_amount, find_amount_in_text, amount_direction
                client = GmailClient(uid, msg["account"], token)
                text = msg.get("subject", "") + " " + msg.get("snippet", "") + " " + msg.get("body", "")
                html = ""
                try:                                   # include the HTML body's text (stripped of tags)
                    html = client.get_html(message_id)
                    text += " " + re.sub(r"<[^>]+>", " ", html or "")
                except Exception:
                    html = ""
                amount = find_amount_in_text(text)     # free text scan first
                if amount <= 0:                        # only pay for vision when the text has nothing
                    images = client.get_amount_images(message_id)          # inline/attached images
                    if len(images) < 3 and html:                           # many totals live in a remote banner image
                        images += client.fetch_html_images(html, max_images=3 - len(images))
                    amount = read_amount(text, images)
                direction = amount_direction(text)     # money to receive ('in') or pay ('out')
            except Exception:
                amount = 0.0
    if amount > 0:                                     # don't cache 0 — let a later, better pass retry
        store.set_money(uid, message_id, amount)
    return {"ok": True, "amount": amount, "direction": direction}


@app.get("/api/messages/{message_id}/html")
def message_html(request: Request, message_id: str) -> dict:
    """Fetch a message's rich HTML body on demand (live only). Kept out of the
    stored blob so persistence stays small; the UI loads it when you tap
    'Show images'. Demo/no-token falls back to the stored plain-text body."""
    uid = _uid(request)
    msg = next((m for m in store.messages(uid, include_archived=True) if m["id"] == message_id), None)
    if not msg:
        raise HTTPException(status_code=404, detail="message not found")
    if settings.is_live:
        token = store.get_token(uid, msg.get("account"))
        if token:
            try:
                from .gmail_client import GmailClient
                html = GmailClient(uid, msg["account"], token).get_html(message_id)
                return {"ok": True, "html": html}
            except Exception:
                pass  # fall back to stored text below
    import html as _h
    text = msg.get("body") or msg.get("snippet") or ""
    return {"ok": True, "html": "<pre style='white-space:pre-wrap;font:inherit'>" + _h.escape(text) + "</pre>"}


@app.post("/api/messages/{message_id}/labels")
def fix_label(request: Request, message_id: str, label_id: str = Body(embed=True)) -> dict:
    """Add/remove a label on a message and learn from it (applies to same-sender mail)."""
    uid = _uid(request)
    result = store.fix_label(uid, message_id, label_id)
    # if live + mirroring, reflect the new label set of this mail into Gmail (best-effort)
    if settings.is_live and store.get_settings(uid).get("mirror_gmail"):
        _mirror_one(uid, message_id)
    return result


def _mirror_one(uid: str, message_id: str) -> None:
    """Push a single message's current category+labels into Gmail. Best-effort."""
    try:
        from .orchestrator import gmail_label_names, mirror_to_gmail
        from .gmail_client import GmailClient
        msg = next((m for m in store.messages(uid, include_archived=True) if m["id"] == message_id), None)
        if not msg:
            return
        token = store.get_token(uid, msg.get("account"))
        if not token:
            return
        client = GmailClient(uid, msg["account"], token)
        mirror_to_gmail(client, message_id, gmail_label_names(uid, msg))
    except Exception:
        pass


@app.post("/api/labels/ai-match")
def ai_match(request: Request, description: str = Body(""), items: list = Body(default=[])) -> dict:
    """Evaluate a plain-language label rule with Claude (semantic match). Returns
    the ids of the supplied emails that match. Live only; demo returns none so
    the client falls back to its on-device keyword match."""
    _uid(request)
    if not settings.is_live:
        return {"ids": []}
    from .intelligence import match_rule_by_description
    try:
        ids = match_rule_by_description(str(description), items or [])
    except Exception:
        ids = []
    return {"ids": ids}


@app.post("/api/labels")
def add_label(request: Request, name: str = Body(embed=True)) -> dict:
    uid = _uid(request)
    import re
    lid = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:24] or f"lbl{len(store.labels(uid))}"
    palette = ["#7C3AED", "#0891B2", "#059669", "#EA580C", "#D6336C"]
    label = {"id": lid, "name": name, "color": palette[len(store.labels(uid)) % len(palette)]}
    store.add_label_def(uid, label)
    return {"ok": True, "label": label}


@app.post("/api/accounts/connect")
def connect_account(request: Request, name: str = Body(""), email: str = Body("")) -> dict:
    """Demo: add a fake account instantly. Live: return a Google OAuth URL (#29)."""
    uid = _uid(request)
    if settings.is_live:
        state = secrets.token_urlsafe(16)
        _OAUTH_STATES[state] = uid
        return {"authorize_url": auth.authorize_url(state)}
    n = len(store.accounts(uid))
    acct = {"id": f"acct{n}", "name": name or (email.split('@')[0] if email else f"Account {n+1}"),
            "email": email or f"account{n+1}@example.com", "color": _ACCT_PALETTE[n % len(_ACCT_PALETTE)]}
    store.add_account(uid, acct)
    return {"ok": True, "account": acct}


@app.get("/api/accounts/callback")
def accounts_callback(state: str = "", code: str = ""):
    """Google OAuth redirect target. Two intents share it:
    - login: no session yet → your Google email becomes your user id; set a cookie.
    - add mailbox: already signed in → attach another Gmail account to your user.
    Either way the connected mailbox is synced (#29)."""
    intent = _OAUTH_STATES.pop(state, None)
    if not intent or not code:
        raise HTTPException(status_code=400, detail="invalid oauth state")
    token = auth.exchange_code(code)

    if intent == _LOGIN_INTENT:
        email = auth.fetch_email(token["token"])
        if not email:
            raise HTTPException(status_code=400, detail="could not read Google email")
        if settings.owner_email and email.lower() != settings.owner_email.lower():
            raise HTTPException(status_code=403, detail="this account is not allowed to sign in")
        uid = email  # identity = your email
        store.ensure_user(uid, email=email, seed=False)
        _connect_mailbox(uid, token)
        resp = RedirectResponse("/")
        resp.set_cookie(auth.COOKIE, auth.make_session(uid), httponly=True,
                        secure=settings.cookie_secure, samesite="lax", max_age=60 * 60 * 24 * 30)
        return resp

    # otherwise `intent` is an existing user id adding another mailbox
    _connect_mailbox(intent, token)
    return RedirectResponse("/")


@app.post("/api/accounts/{account_id}/sync")
def sync_account(request: Request, account_id: str) -> dict:
    """Re-run classify/summarize for one account (live mode)."""
    uid = _uid(request)
    if not settings.is_live:
        return {"ok": True, "processed": 0, "note": "demo mode — nothing to sync"}
    from .orchestrator import process_account
    return {"ok": True, "processed": process_account(uid, account_id)}


@app.post("/api/accounts/{account_id}/backfill")
def backfill(request: Request, account_id: str,
             since: str = Body("2026-06-01"), max_results: int = Body(50)) -> dict:
    """Import received mail since a date into the Archive (live mode). Idempotent."""
    uid = _uid(request)
    if not settings.is_live:
        return {"ok": True, "processed": 0, "note": "demo mode — nothing to import"}
    from .orchestrator import backfill_account
    since_q = str(since).replace("-", "/")   # accept YYYY-MM-DD, Gmail wants YYYY/MM/DD
    try:
        n = backfill_account(uid, account_id, since_q, int(max_results))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"import failed: {e}")
    return {"ok": True, "processed": n}


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
