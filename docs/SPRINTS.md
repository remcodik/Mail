# MailAI — Sprint plan & living log

> How we build: small, testable increments. Each sprint has a **SMART** goal
> (Specific · Measurable · Achievable · Relevant · Time-boxed), a demo, and a
> Definition of Done. This file is the source of truth for *progress*; the
> phased scope lives in [`ROADMAP.md`](./ROADMAP.md); individual work items are
> GitHub issues.

Last updated: 2026-07-15 · Branch: `claude/review-eval-documentation-ip029b`

## Working agreements

- **Testable every sprint.** Each sprint ends with something you can open and click.
- **Frontend first, mock data first.** The UI ships against fixtures so it's
  deployable as a static site (public githack link) with no secrets. The fixture
  shape *is* the backend API contract.
- **Docs stay current.** Every sprint updates this log + the roadmap status and
  ticks the relevant GitHub issues.
- **Nothing irreversible without a tap.** Send/archive/delete/unsubscribe always
  need explicit confirmation (carried into the real backend later).

## Assumptions (defaults chosen to keep momentum — revisit anytime)

- **Single-user prototype** for now (one Gmail account, local token). Multi-user is later.
- **Gmail labels = source of truth**, cached locally.
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

---

## Sprint 2 — Backend read path: Gmail + classify + summarize

**SMART goal:** A local backend that authenticates to Gmail, classifies and
summarizes real inbox mail, and serves it as JSON matching the Sprint 1 fixture
shape; the UI flips from fixtures to the live API with one flag.

- **Specific:** `auth.py` (OAuth2), `gmail_client.py` (read/list/labels),
  `intelligence.classify_email` + `summarize_thread` (Claude), `orchestrator.process_inbox()`,
  `server.py` (HTTP/JSON + serve `ui/`).
- **Measurable:** `GET /api/inbox` returns categorized, summarized real emails;
  the UI renders them unchanged; running twice creates no duplicates (idempotent).
- **Relevant:** first real value — your actual inbox, triaged.
- **Time-boxed:** next sprint. **Test:** runs locally (`python server.py`), not githack (needs a server + secrets).

Relates to issues: #1, #2, #3, #4, #5, #6, #7, #8.

## Sprint 3 — Act on mail: replies, tasks, newsletters, junk, waiting

Draft replies (suggestion-only), extract tasks, List-Unsubscribe handling,
junk auto-archive, sent-mail follow-ups. Relates to: #10–#15.

## Sprint 4 — Rich detection: delivery, purchase, travel, tickets + Wallet

`detect_delivery` / `detect_purchase` / `detect_travel` / `detect_ticket`,
Wallet pass (prototype path first). Relates to: #17, #18, #23, #24, #26.

## Sprint 5 — Customization & hardening

User-customizable categories end-to-end, rules engine, rate limits, cost caps,
privacy disclosure. Relates to: #19, #20, #21, #27.

---

## Log

| Date | Sprint | Update |
|------|--------|--------|
| 2026-07-15 | 1 | Sprint plan created; Sprint 1 started. |
| 2026-07-15 | 1 | Sprint 1 **done**: `ui/` SPA shipped (cockpit → category → detail, settings, tasks) on mock data; navigation + archive/delete/toggle/add-category working; verified in Chromium; deployed via githack. Next: Sprint 2 backend read path. |
