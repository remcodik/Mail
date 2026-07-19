# MailAI — your setup & login guide

A plain-language, start-to-finish guide to putting **your** MailAI online and
signing in on your iPhone. Follow it top to bottom once; after that, using the
app is just "open the link and you're in".

> **You'll need a computer for the one-time setup (Parts A–D)** — Google Cloud
> and the deploy step aren't practical on a phone. **Parts E onward are on your
> iPhone.** Budget ~30–40 minutes for the first time.

---

## What you'll end up with

- A private web address (e.g. `https://mailai-remco.fly.dev`) that only **you**
  can sign into (locked to `dik.remco@gmail.com`).
- "Sign in with Google" → your inbox, triaged into the cockpit.
- Optionally, your categories & labels showing up **inside the Gmail app** too.

---

## Before you start — three things only you can provide

| # | Thing | Where | Cost |
|---|-------|-------|------|
| 1 | **Google OAuth client** (lets MailAI read your Gmail) | Google Cloud Console | free |
| 2 | **Anthropic API key** (the AI that classifies/summarizes) | console.anthropic.com | pay-per-use, cents/day |
| 3 | **A host** (runs the app) | Fly.io (recommended) | free tier is enough to start |

---

## Part A — Google Cloud (the Gmail connection)

1. Go to <https://console.cloud.google.com> and create a project (call it
   `MailAI`).
2. **Enable the Gmail API**: search "Gmail API" → **Enable**.
3. **OAuth consent screen**: choose **External** → fill app name "MailAI" and
   your email → **Save**. Under **Test users**, add `dik.remco@gmail.com`.
   (Keeping it in "Testing" is fine for personal use — no Google verification
   needed.)
4. **Create credentials** → **OAuth client ID** → type **Web application**.
   - Leave the redirect URI blank *for now* — you'll add it in Part D once you
     know your live URL.
   - Click **Create** and copy the **Client ID** and **Client secret**.

Scopes MailAI asks for: read/modify Gmail + your email address. It never sends
or deletes without you tapping.

## Part B — Anthropic API key

1. Go to <https://console.anthropic.com> → **API keys** → **Create key**.
2. Copy the key (starts with `sk-ant-…`). Add a small credit balance.

## Part C — Deploy (Fly.io)

On your computer, in this project folder:

```bash
# 1. Install the Fly CLI and log in
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Pick a globally-unique name and create the app
fly apps create mailai-remco          # <-- choose your own name

# 3. A volume so your data + tokens survive restarts
fly volumes create mailai_data --size 1 --region ams

# 4. Your secrets (never committed)
fly secrets set \
  MAILAI_MODE=live \
  MAILAI_SESSION_SECRET="$(openssl rand -hex 32)" \
  MAILAI_OWNER_EMAIL="dik.remco@gmail.com" \
  MAILAI_DB="/data/mailai.db" \
  ANTHROPIC_API_KEY="sk-ant-…" \
  GOOGLE_CLIENT_ID="…apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="…" \
  MAILAI_OAUTH_REDIRECT_BASE="https://mailai-remco.fly.dev"

# 5. Edit fly.toml: set `app` and MAILAI_OAUTH_REDIRECT_BASE to match your name,
#    mount the volume, then deploy
fly deploy
```

In `fly.toml`, make sure the volume is mounted at `/data`:

```toml
[mounts]
  source = "mailai_data"
  destination = "/data"
```

`MAILAI_OWNER_EMAIL` is the important one: it means **only your Google account
can sign in**. Anyone else who opens the link is refused.

## Part D — Connect the redirect URI

Back in **Google Cloud → Credentials → your OAuth client → Authorized redirect
URIs**, add exactly:

```
https://mailai-remco.fly.dev/api/accounts/callback
```

(Use your real app name. It must match `MAILAI_OAUTH_REDIRECT_BASE` + `/api/accounts/callback`.) Save.

---

## Part E — Log in (on your iPhone) 📱

1. Open `https://mailai-remco.fly.dev` in Safari.
2. You'll see the **MailAI sign-in screen** → tap **Sign in with Google**.
3. Pick `dik.remco@gmail.com`, approve the Gmail permission.
4. You're dropped back into MailAI, **signed in**, with that mailbox connecting
   and syncing. Done.
5. Tip: tap Safari's **Share → Add to Home Screen** so MailAI opens like a real
   app (full-screen, with the **MailAI teal envelope icon** — see
   `docs/screenshots/home-mockup.png`).

**How login works:** your Google email *is* your account — there's no separate
password. After signing in, a secure cookie keeps you logged in for ~30 days.
To sign out, open `…/api/logout`.

**Add another mailbox (e.g. Work):** Settings → **Mail accounts → + Add a mail
account** → sign in with that Google account. It's kept separate (its own colour;
the cockpit's account switcher filters by it).

## Part F — Show your labels in Gmail (optional)

Settings → **Show in Gmail** → toggle on. From then on, each mail's **category**
becomes a `MailAI/…` label in Gmail (e.g. `MailAI/Urgent`) and its **labels**
too (e.g. `MailAI/Acme Corp`) — all under one collapsible `MailAI/` group you
can see and search in the Gmail app. Turn it off and MailAI stops writing new
labels (existing ones stay until you delete the `MailAI/` group in Gmail).

---

## Everyday use

- Open the link (or your home-screen icon) — you're already signed in.
- New mail lands in the cockpit; existing mail was filed to Archive on first
  connect (move any of it back with one tap).
- Fix a wrong category or label once → MailAI proposes a rule and learns.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "redirect_uri_mismatch" on sign-in | The URI in Google Cloud must exactly equal `MAILAI_OAUTH_REDIRECT_BASE` + `/api/accounts/callback`. |
| "this account is not allowed to sign in" | You signed in with an email ≠ `MAILAI_OWNER_EMAIL`. Use your own, or change the secret. |
| Signed in but no mail | Give the first sync a moment, or Settings → Mail accounts → re-sync. Check the Anthropic key has credit. |
| Data gone after a while | Make sure `MAILAI_DB=/data/mailai.db` **and** the volume is mounted at `/data` (Part C). |
| Google "unverified app" warning | Expected while the consent screen is in Testing with you as a test user — continue. |

## Costs

Fly's free allowance covers a small personal app. Anthropic is pay-as-you-go —
classification uses a cheap fast model, summaries a stronger one; expect a few
cents a day for normal volume. Set a budget alert in the Anthropic console.
