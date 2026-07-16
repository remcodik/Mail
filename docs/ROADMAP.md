# MailAI — Evaluation, Plan & Roadmap

> Status: **Building — Sprint 1 done.** The interactive frontend (`ui/`) is
> live on mock data; see [`SPRINTS.md`](./SPRINTS.md) for sprint progress. This
> document evaluates the spec, records open questions, and lays out the phased
> plan tracked in GitHub Issues.

Last reviewed: 2026-07-14

---

## 1. Executive summary

MailAI is an AI-powered iPhone mail client that connects to Gmail, triages
incoming mail into categories, summarizes threads, drafts replies, extracts
tasks, pushes tickets to Apple Wallet, reminds the user about unanswered sent
mail, proposes meetings, and handles newsletters/junk.

The concept is well-scoped for an MVP and the spec (`CLAUDE.md`) is unusually
detailed for a greenfield project — categories, intelligence function
signatures, UI screens, and MCP tools are all defined. The main work is
turning that spec into a phased, buildable plan and closing a set of
architectural and product gaps before code is written.

**Recommendation:** Build in three phases (MVP → v1 → v2). Ship a read-only
triage + summarize experience first (fastest path to daily value, lowest risk),
then layer in reply drafting / tasks / newsletters, and finally the
higher-complexity integrations (Apple Wallet, scheduling).

---

## 2. Spec evaluation

### 2.1 Strengths

- **Clear category taxonomy** with a defined action per category.
- **Concrete function signatures** in `intelligence.py` — easy to stub and test.
- **All Claude calls funneled through `intelligence.py`** — good separation and
  a single place to manage prompts, model choice, and cost.
- **Mobile-web delivery** (Safari, no App Store) removes a large distribution
  and review burden for a prototype.
- **Correction loop** design (few-shot from `corrections.json`) is a pragmatic
  way to improve classification without fine-tuning.

### 2.2 Gaps & risks (to resolve before/while building)

| # | Area | Gap / risk | Suggested resolution |
|---|------|-----------|----------------------|
| G1 | **Model id** | Spec pins `claude-sonnet-4-6`, which is not a current model id. | Verify against the current model list and pin a current id. Suggest a fast/cheap model for classification and a stronger model for drafting/summarization. Centralize in config. |
| G2 | **Auth & token storage** | `token.json` on disk is fine for single-user prototype but not multi-user or hosted. No refresh/expiry handling described. | Document single-user prototype scope explicitly; plan a token-store abstraction for later. Handle refresh + revocation. |
| G3 | **Data persistence** | Tasks in `tasks.md`, corrections in `corrections.json`, rules undefined. No store for `waiting`/follow-up state, category assignments, or dedupe. | Define a lightweight store (SQLite recommended) or JSON files with a documented schema. Decide source of truth vs. Gmail labels. |
| G4 | **State source of truth** | Category, read/archived, snooze — stored locally or reflected as Gmail labels? | Recommend Gmail labels as source of truth (survives reinstall, syncs across clients); cache locally for speed. |
| G5 | **Polling vs push** | Sent-mail monitoring and auto-dismiss "poll sent/inbox" — cost and latency unclear. | Use Gmail `history.list` + `watch`/Pub-Sub if hosted; simple interval poll for prototype. Document the tradeoff. |
| G6 | **Apple Wallet signing** | `.pkpass` files must be cryptographically signed with an Apple Pass Type ID certificate. This is a hard prerequisite, not a code detail. | Track as a blocking dependency for the Wallet feature. Prototype path (Pass4wallet) avoids signing; production path needs the cert. |
| G7 | **Unsubscribe safety** | Auto-calling `List-Unsubscribe` URLs / one-click (RFC 8058 `List-Unsubscribe-Post`) can confirm your address to spammers. | Require explicit user confirmation; prefer `mailto:` and RFC 8058 POST; never GET-fetch unknown URLs silently. |
| G8 | **Privacy / PII** | Full email bodies sent to the Claude API. Users must understand this. | Add a clear privacy disclosure + setting. Consider redaction options and opt-out categories. |
| G9 | **Prompt injection** | Email content is untrusted and flows into classification/summary/reply prompts. | Treat email as data, not instructions. Use structured prompts, never let email text redirect actions (send/archive/delete) without user confirmation. |
| G10 | **Cost controls** | Every inbound email → 1+ Claude calls. Unbounded on a busy inbox. | Batch classification, cache, cap per-run volume, and only run expensive functions (draft/summarize) on demand or for high-value categories. |
| G11 | **Idempotency / dedupe** | Reprocessing the same message could double-create tasks/drafts/reminders. | Key all derived artifacts by Gmail message/thread id; make the pipeline idempotent. |
| G12 | **Error handling & rate limits** | Gmail and Claude both rate-limit. Not addressed. | Add retry with backoff, partial-failure handling, and a dead-letter/skip log. |
| G13 | **Testing strategy** | No fixtures/tests described. | Add sample-email fixtures + a `SessionStart` hook so tests/lint run in web sessions. Mock Gmail + Claude. |
| G14 | **Secrets** | `.env` only; `credentials.json`/`token.json` must never be committed. | Add `.gitignore` covering secrets/tokens; document setup. |

### 2.3 Open product questions

These are surfaced as questions in the tracking issue; a few are worth deciding
early because they shape the data model:

1. ~~Single-user prototype or multi-user hosted?~~ **Decided: multi-user (multi-tenant), with multiple mail accounts per user (Work/Private), clearly separated.** See CLAUDE.md → *Multi-user & multi-account* and `SPRINTS.md`. This resolves G2/G3 toward per-`(user, account)` tokens and per-`user_id` storage.
2. **Is Gmail the source of truth** (via labels) or a local DB? (Drives sync model.)
3. **How autonomous?** Should the app ever send/archive/delete without explicit
   tap, or is everything a suggestion until confirmed? (Recommend suggestion-only
   for anything irreversible in early phases.)
4. **Wallet path for v1:** Pass4wallet prototype only, or invest in the Apple
   Pass Type ID certificate for real `.pkpass` delivery?
5. **Where does it run?** Local network only (as spec setup implies) or deployed?

---

## 3. Architecture at a glance

```
                 ┌──────────────────────────┐
   iPhone Safari │   ui/ (HTML/CSS/JS)      │
   ───────────►  │   category tabs, detail  │
                 └───────────┬──────────────┘
                             │ HTTP (local)
                 ┌───────────▼──────────────┐
                 │   server.py (MCP + HTTP) │   MCP tools:
                 │   exposes tools + serves │   list/get/archive/delete/
                 │   UI + orchestrates      │   label/draft/send/mark_read
                 └───┬───────────────┬──────┘
                     │               │
        ┌────────────▼───┐   ┌───────▼─────────────┐
        │ gmail_client.py│   │  intelligence.py    │
        │  Gmail API     │   │  ALL Claude calls   │
        │  (OAuth2)      │   │  classify/summarize │
        └──────┬─────────┘   │  tasks/draft/detect │
               │             └─────────┬───────────┘
        ┌──────▼─────┐        ┌────────▼─────────┐
        │  Gmail     │        │  Claude API      │
        └────────────┘        └──────────────────┘

   orchestrator.py = process_inbox() pipeline tying the above together.
   Persistence: tasks.md, corrections.json, rules, waiting-state store.
```

---

## 4. Phased delivery plan (milestones)

> GitHub lacks milestone creation via the current tooling, so phases are tracked
> with `phase:*` labels and this roadmap. Each feature below is a GitHub issue.

### Phase 0 — Project setup (foundation)
- Repo scaffolding: `requirements.txt`, `.env.example`, `.gitignore`, `README`
- `SessionStart` hook so web sessions can run lint/tests
- Config module (model ids, thresholds) — resolves **G1**

### Phase 1 — MVP: read-only triage + summarize
Goal: connect Gmail, classify inbox, browse by category, read AI summaries.
- `auth.py` — OAuth2 flow (**G2**)
- `gmail_client.py` — read/list/get, labels (**G4**, **G12**)
- `intelligence.classify_email` + correction loop scaffolding (**G9**, **G10**)
- `intelligence.summarize_thread`
- `orchestrator.process_inbox()` — idempotent pipeline (**G11**)
- `server.py` — MCP tools + serve UI
- UI: **Cockpit start screen** (category count tiles → tap to drill into a list) + Home category tabs + Email detail (summary card)

### Phase 2 — v1: act on mail
Goal: draft replies, extract tasks, manage newsletters/junk, follow-ups.
- `intelligence.extract_tasks` + `tasks.md` store (**G3**)
- `intelligence.draft_reply` + create_draft/send (suggestion-only)
- Newsletter detection + `List-Unsubscribe` handling (**G7**)
- Junk auto-archive/delete after 7 days
- Sent-mail monitoring → `awaiting_reply` / Waiting screen (**G5**)
- Corrections persistence + few-shot injection
- UI: Newsletter, Waiting, Settings/Rules screens

### Phase 3 — v2: rich integrations
Goal: Wallet, scheduling, polish.
- Ticket detection (`detect_ticket`)
- Delivery & pickup detection (`detect_delivery`) → **Deliveries** tab (carrier, status, ETA, pickup location/code)
- Purchase/order & receipt detection (`detect_purchase`) → **Purchases** tab (merchant, order #, total; optional Wallet receipt)
- Travel/itinerary detection (`detect_travel`) → **Travel** tab, grouped by trip (flights, hotels, trains, car)
- Apple Wallet pass generation + delivery (**G6**)
- Scheduling intent + appointment proposals (Calendar)
- Rules engine (plain-language classification rules)
- **User-customizable categories** — add / reorder / hide cockpit tiles; custom category definitions feed the classifier (extends the rules engine)
- Hardening: rate limits, cost caps, privacy disclosure (**G8**, **G10**, **G12**)

---

## 5. Definition of done (per feature)

- Type hints on all functions (Python 3.11+ per conventions)
- Secrets via `.env`; no credentials/tokens committed
- All Claude calls go through `intelligence.py`
- Unit test or fixture-based test where practical (mock Gmail + Claude)
- Idempotent w.r.t. Gmail message/thread id
- Irreversible actions (send/archive/delete/unsubscribe) require user confirmation

---

## 6. Mockup

An interactive iPhone mockup of the seven core screens lives at
[`docs/mockup.html`](./mockup.html) — open it in any browser (adapts to
light/dark). It starts with the **Cockpit** (category count tiles), then the
Category view (clickable tabs, incl. Travel), Email detail, Newsletter,
Tickets/Wallet, Waiting, and Settings (category customization). This is a
static design reference for Phases 1–2, not shipping code.

## 7. Tracking

- **Meta / epic issue:** see the pinned tracking issue in GitHub Issues (#22).
- **Per-feature issues:** labeled `phase:0|1|2|3`, `area:*`, and `type:feature`.
- **This document** is the living plan; update it as decisions land.
