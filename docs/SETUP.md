# MailAI — setup & deployment

The backend runs in two modes:

- **`demo`** (default) — seeded data, no external calls, **no secrets required**.
  Perfect for local dev and the design prototype.
- **`live`** — real Gmail + Claude, multi-user, multiple accounts per user.
  Requires the credentials below.

## Run locally (demo mode)

```bash
pip install -r requirements.txt
python server.py                     # http://localhost:8000
```

Open <http://localhost:8000> — the UI loads from `GET /api/inbox`. No `.env` needed.

> The static prototype (`ui/` opened directly, or the githack link) still works
> on its own: if `/api/inbox` isn't reachable it falls back to `ui/fixtures.js`.

## API (v0.2)

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/health` | liveness + mode |
| GET  | `/api/me` | current user profile |
| GET  | `/api/inbox?account=all\|<id>` | accounts + categories + messages (per user, optionally one account) |
| POST | `/api/messages/{id}/archive` | archive a message |
| POST | `/api/categories/{id}/visibility` | show/hide a cockpit category |
| POST | `/api/accounts/connect` | demo: add account · live: return Google OAuth URL |

Every request is scoped to the authenticated `user_id`; accounts stay separated
by `account_id` and are only combined when `account=all`.

## Go live — what you need to provide

Live mode needs three things I can't provision for you:

1. **Google Cloud OAuth client** — create a project, enable the Gmail API, make
   an OAuth 2.0 Client (type: Web). Add the redirect URI
   `https://<your-domain>/api/accounts/callback`. Copy the client id/secret.
2. **Anthropic API key** — from the Anthropic Console, for classification/summaries.
3. **A host** — anywhere that runs the Docker image (Fly.io, Render, Railway,
   Cloud Run, a VPS, …). You'll also want a real database to replace the
   in-memory store (same interface, keyed by `user_id`).

Then set the environment (see `.env.example`):

```bash
MAILAI_MODE=live
MAILAI_SESSION_SECRET=<long random string>
ANTHROPIC_API_KEY=<key>
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
MAILAI_OAUTH_REDIRECT_BASE=https://<your-domain>
MAILAI_MODEL_CLASSIFY=claude-haiku-4-5-20251001   # fast/cheap for triage
MAILAI_MODEL_REASON=claude-sonnet-5               # stronger for summaries/drafts
```

## Deploy to Fly.io (recommended)

`fly.toml` is included. One-time:

```bash
# 1. install flyctl + log in
curl -L https://fly.io/install.sh | sh && fly auth login

# 2. pick a globally-unique app name; edit `app` and the two URLs in fly.toml
fly apps create your-mailai-name

# 3. set secrets (not committed)
fly secrets set \
  MAILAI_SESSION_SECRET="$(openssl rand -hex 32)" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="..."

# 4. deploy
fly deploy
```

Then, in **Google Cloud → Credentials → your OAuth client**, add the authorized
redirect URI: `https://your-mailai-name.fly.dev/api/accounts/callback` (must match
`MAILAI_OAUTH_REDIRECT_BASE`). Open the app, go to **Settings → Mail accounts →
Add a mail account** to connect Gmail; each connected account syncs and stays
separated.

> ⚠️ The in-memory store resets when the machine restarts. Before real use, wire a
> database + encrypted token storage (#30) — the `Store` interface is drop-in.

## Deploy with plain Docker (any host)

```bash
docker build -t mailai .
docker run -p 8000:8000 --env-file .env mailai
```

The image honours the platform's `$PORT`. (Vercel wasn't usable here — the
connected account can't create projects — so we target any container host.)

## What's implemented vs. pending (Sprint 2)

- ✅ **2a:** FastAPI backend, multi-user tenancy + isolation, per-account
  separation, demo provider, `GET /api/inbox`, UI wired to the API.
- ✅ **2b (#29):** multi-account Gmail OAuth (`/api/accounts/connect` →
  `/api/accounts/callback`), token per `(user, account)`, real `gmail_client.py`
  read/archive. **Untested until your Google creds are set.**
- ✅ **2c (#5, #6):** `orchestrator.process_account()` classifies + summarizes new
  mail via `intelligence.py` (Claude); idempotent by Gmail id. **Untested until
  your Anthropic key is set.**
- ⏳ **Persistence (#30):** swap the in-memory `Store` for a database + encrypted
  token storage before production.
- ⏳ **Next:** first real end-to-end sync (needs creds + host), then richer
  detectors (delivery/purchase/travel/tickets — Sprint 4).
