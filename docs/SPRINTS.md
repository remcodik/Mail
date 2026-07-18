# MailAI — Sprint plan & living log

> How we build: small, testable increments. Each sprint has a **SMART** goal
> (Specific · Measurable · Achievable · Relevant · Time-boxed), a demo, and a
> Definition of Done. This file is the source of truth for *progress*; the
> phased scope lives in [`ROADMAP.md`](./ROADMAP.md); individual work items are
> GitHub issues.

Last updated: 2026-07-15 · Branch: `claude/review-eval-documentation-ip029b`

## Working agreements

- **Check in at every sprint boundary.** Do NOT start the next sprint
  autonomously — finish a sprint, demo it, then pause for approval before the next.
- **Testable every sprint.** Each sprint ends with something you can open and click.
- **Frontend first, mock data first.** The UI ships against fixtures so it's
  deployable as a static site (public githack link) with no secrets. The fixture
  shape *is* the backend API contract.
- **Docs stay current.** Every sprint updates this log + the roadmap status and
  ticks the relevant GitHub issues.
- **Nothing irreversible without a tap.** Send/archive/delete/unsubscribe always
  need explicit confirmation (carried into the real backend later).

## Decisions (confirmed with the user)

- **Multi-user (multi-tenant).** Each user authenticates and sees only their own
  data; all storage keyed by `user_id`; no cross-user access.
- **Multiple mail accounts per user, clearly separated** (e.g. Work, Private).
  Each account has its own OAuth token. UI has an account switcher (All / per
  account); every email is tagged with its account; data model is
  `user_id → accounts[] → messages(account_id)`.
- **Gmail labels = source of truth** per account, cached locally.
- **Suggestion-only** for irreversible actions in early sprints.
- Model id pinned in config, verified against the current model list at Sprint 2.

---

## Sprint 1 — Interactive frontend prototype (mock data) · **DONE ✅**

**SMART goal:** Ship `ui/` as a working single-page app rendering all core
screens from a fixtures module, navigable by tap, deployed to a public URL you
can test on your phone — by end of this session.

- **Specific:** Cockpit (tiles) → Category list (tabs) → Email detail; plus
  Newsletter, Waiting, Tickets, Settings. Hash routing, back nav, bottom nav.
- **Measurable:** every screen reachable by tap; cockpit counts equal the fixture
  data; archive/delete update counts live; deployed link loads on mobile.
- **Achievable:** vanilla HTML/CSS/JS, reuse the mockup's design tokens, no backend.
- **Relevant:** de-risks the UX, and locks the data shape the backend must serve.
- **Time-boxed:** this session.

**Demo / test:** open the deployed link → tap tiles, open emails, switch tabs,
archive a card, toggle a category off in Settings and watch its tile disappear,
add a custom category tile.

**Definition of Done**
- [x] `ui/index.html`, `ui/style.css`, `ui/app.js`, `ui/fixtures.js` committed
- [x] All screens navigable (Cockpit, Category, Detail, Newsletter, Waiting, Tickets, Settings, Tasks); counts derived from fixtures
- [x] Archive/delete/reply/unsubscribe interactive (mutate state + toast), suggestion-only
- [x] Settings: toggle category visibility + add a custom category, reflected on cockpit
- [x] Verified rendering + navigation via Chromium (no console errors)
- [x] Deployed public link (githack); roadmap status + this log + GitHub issues updated

Relates to issues: #9 (category view), #25 (cockpit), #16 (settings), #27 (custom categories).

## Sprint 1.1 — Multi-account separation (frontend) · **DONE ✅**

Added on top of Sprint 1 per the multi-user/multi-account decision:
- Account switcher (**All mail · Work · Private**) on cockpit + category views;
  filters tiles, counts, and lists to the selection.
- Every email tagged with its account (Work/Private) so lists stay clearly
  separated even under "All".
- Settings → **Mail accounts**: connected accounts with colour + address, and
  **+ Add a mail account**.
- Data shape now carries `accounts[]` and `message.account` (contract for the
  per-account backend).

Relates to issues: #28 (multi-account UI), #29 (per-account OAuth), #30 (multi-user tenancy).

---

## Sprint 2 — Multi-user auth + multi-account Gmail read + classify/summarize

**SMART goal:** A backend where a user signs in, connects one or more Gmail
accounts (Work/Private), and sees each account's inbox classified + summarized,
served as JSON matching the Sprint 1 shape; the UI flips from fixtures to the
live API with one flag, keeping accounts separated.

- **Specific:** user auth + tenancy (`user_id` isolation); `auth.py` multi-account
  OAuth (token per (user, account)); `gmail_client.py` per-account read/labels;
  `intelligence.classify_email` + `summarize_thread` (Claude); `orchestrator.process_inbox(account)`;
  `server.py` (`GET /api/inbox?account=`), serve `ui/`.
- **Measurable:** signing in and connecting a Gmail account returns that account's
  categorized, summarized mail; the switcher filters by account; no cross-user or
  cross-account leakage; re-running creates no duplicates (idempotent).
- **Relevant:** first real value — your actual inboxes, triaged and separated.
- **Time-boxed:** next sprint. **Test:** runs locally (`python server.py`) — needs secrets + a server, so not githack-deployable like Sprint 1.

Relates to issues: #1, #2, #3, #4, #5, #6, #7, #8, #29, #30.

**Progress:**
- ✅ **2a — backend skeleton + demo API (done).** FastAPI app (`app/`): multi-user
  tenancy with per-`user_id` isolation, per-account separation, demo provider,
  `GET /api/inbox` (+ archive / visibility / connect), UI wired to the API with
  fixtures fallback, `Dockerfile` + `.env.example` + `docs/SETUP.md`. Verified
  locally (API + browser). See #4/#7/#8/#30 partials.
- ✅ **2b — real Gmail OAuth per account (#29) — code done.** `/api/accounts/connect`
  → Google consent → `/api/accounts/callback`; token stored per `(user, account)`;
  `app/gmail_client.py` reads/parses/archives real Gmail. Untested until your
  Google OAuth client is set.
- ✅ **2c — Claude pipeline (#5, #6) — code done.** `app/orchestrator.py`
  classifies + summarizes each new message via `app/intelligence.py`, idempotent
  by Gmail id. Untested until your Anthropic key is set.
- ⏳ **Persistence (#30):** swap in-memory store → database + encrypted tokens (before prod).
- ⏳ **First live sync:** needs creds + a host — then we verify end-to-end together.

**Blockers for going live (only you can provide):** a Google Cloud OAuth client,
an Anthropic API key, and a host — see `docs/SETUP.md`.

## Sprint 3 — Persistence (durable, encrypted) · **DONE ✅**

- SQLite-backed store (`app/persistence.py`), enabled by `MAILAI_DB`; same `Store`
  interface (drop-in), write-through on every mutation.
- **OAuth tokens encrypted at rest** (Fernet, key derived from the session secret).
- Verified: data survives a process restart; tokens are not stored in plaintext;
  a wrong secret decrypts nothing.

Covers #30. (Other Sprint-3 acts — reply send, unsubscribe, junk timers — are
already stubbed suggestion-only in the UI; live wiring rides with 2b/2c.)

## Sprint 4 — Rich detection: delivery, purchase, travel, tickets · **CODE DONE ✅**

- `detect_delivery` / `detect_purchase` / `detect_travel` / `detect_ticket` +
  `detect_scheduling_intent` in `app/intelligence.py` (Claude JSON extraction in
  live mode); wired into `orchestrator.process_account` to attach `extracted` data.
- UI shows an **Extracted details** panel on the detail screen; demo data enriched
  for delivery/purchase/travel so it's visible now.
- Wallet pass generation (#18) still pending (needs the Apple Pass Type ID cert).
- Relates to: #17, #23, #24, #26 (detectors done); #18 (Wallet — pending cert).

## Sprint 5 — Customization & hardening

User-customizable categories end-to-end, rules engine, rate limits, cost caps,
privacy disclosure. Relates to: #19, #20, #21, #27.

---

## Log

| Date | Sprint | Update |
|------|--------|--------|
| 2026-07-15 | 1 | Sprint plan created; Sprint 1 started. |
| 2026-07-15 | 1 | Sprint 1 **done**: `ui/` SPA shipped (cockpit → category → detail, settings, tasks) on mock data; navigation + archive/delete/toggle/add-category working; verified in Chromium; deployed via githack. |
| 2026-07-15 | 1.1 | **Multi-user/multi-account decision.** Frontend now separates Work vs Private: account switcher, per-email account tags, Settings → Mail accounts. Assumptions updated (multi-tenant, multi-account). Boundary check-in agreed: pause before Sprint 2. |
| 2026-07-15 | 2a | **Backend started + shipped 2a.** FastAPI backend (`app/`) with multi-user tenancy, per-account separation, demo API; UI now loads from `/api/inbox` (fixtures fallback). Docker + `docs/SETUP.md`. Verified locally. Live Gmail/Claude (2b/2c) pending your Google + Anthropic creds + a host. |
| 2026-07-15 | 2b/2c | **Wrote live code.** Multi-account Gmail OAuth (connect → callback, token per user+account), real `gmail_client.py`, and `orchestrator.py` classify+summarize via Claude (idempotent). Added `fly.toml` + Fly.io deploy steps. Demo mode re-verified; OAuth URL builder validated. Untested end-to-end until your Google + Anthropic creds + host. |
| 2026-07-15 | 3 + 4 | **Persistence + detectors.** SQLite store with encrypted tokens (`MAILAI_DB`) — verified durable across restart, tokens not plaintext, wrong key = no access (#30). Detectors (delivery/purchase/travel/ticket) in `intelligence.py` + orchestrator; UI shows an Extracted-details panel; demo enriched. Next: your creds/host for first live sync. |
| 2026-07-16 | 5b | **Rule proposal + per-label cockpit + cockpit clarity.** Label fixes now *propose* a rule to approve/decline (nothing learned until approved). Tapping a label opens a **per-label cockpit** (customer/project workspace: Needs attention / To reply / Waiting / Just info + tasks + preview). Removed duplicate top nav (bottom only); hero "need you / auto-handled" made tappable + explained. Open questions logged in `docs/OPEN_QUESTIONS.md`. |
| 2026-07-16 | 5 | **Labels + tasks + sticky nav (user-requested).** AI-assigned **labels** (project/customer/topic) with one-tap fix that **learns per sender** and re-applies (few-shot into `suggest_labels`); label filter view; Settings shows learned rules. **Tasks** are first-class, created from an email, each **linked back to its mail**. Header now carries sticky Tasks/Settings actions; layout fixed so top+bottom nav hold while lists scroll. Verified in Chromium + backend (fix persists across restart). |
