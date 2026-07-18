# MailAI — Claude Code Project Prompt

## What this app is

An AI-powered mail app for iPhone that connects to Gmail. It:
- Triages incoming emails into categories automatically
- Summarizes threads and drafts replies
- Extracts action items as tasks
- Sends tickets/boarding passes/receipts to Apple Wallet
- Reminds you to follow up on sent emails with no reply
- Proposes meeting appointments when scheduling is detected
- Auto-archives junk and lets you one-tap unsubscribe from newsletters

## Stack

- **Backend:** Python, Gmail API (OAuth2), Anthropic Claude API, MCP SDK
- **Frontend:** Mobile web app (iPhone Safari), HTML/CSS/JS — no App Store needed
- **AI:** Claude API (`claude-sonnet-4-6`) for classification, summarization, task extraction, reply drafting

## File structure

```
/
├── CLAUDE.md              ← you are here
├── server.py              ← MCP server entry point
├── gmail_client.py        ← Gmail API wrapper
├── intelligence.py        ← Claude API calls (classify, summarize, extract tasks, draft reply)
├── orchestrator.py        ← process_inbox() pipeline
├── auth.py                ← OAuth2 flow for Gmail
├── tasks.md               ← auto-created task store
├── requirements.txt
├── .env.example
└── ui/
    ├── index.html         ← iPhone web app entry point
    ├── style.css          ← mobile-first CSS (safe area, swipe gestures)
    └── app.js             ← frontend logic
```

> **Backend evolution (Sprint 2):** the deployed app is multi-user, so the
> backend now lives in an `app/` FastAPI package (`app/main.py` API + serves
> `ui/`; `app/config.py`, `app/store.py` tenancy, `app/auth.py`, `app/gmail_client.py`,
> `app/intelligence.py`, `app/demo_seed.py`). `python server.py` runs it; `demo`
> mode needs no secrets. MCP tools can be layered on later. See `docs/SETUP.md`.

## Email categories

Claude classifies every email into one of:

| Category | Action |
|----------|--------|
| `urgent` | Summarize + extract tasks + notify |
| `reply_needed` | Draft reply, surface to user |
| `newsletter` | Show in Newsletter tab with Unsubscribe button |
| `junk` | Auto-archive or delete after 7 days |
| `fyi` | Mark read, archive |
| `ticket` | Extract data → Apple Wallet pass |
| `delivery` | Package/shipping update or pickup ready → show status, ETA, pickup location/code; surface in Deliveries tab |
| `purchase` | Order/purchase confirmation or receipt → extract merchant, order #, total; offer Wallet receipt, link to delivery once shipped |
| `travel` | Flight/hotel/train/car booking or itinerary → group by trip, show dates, confirmation, check-in; Travel tab |
| `awaiting_reply` | Sent email with request → create follow-up reminder |
| `scheduling` | Mentions meeting → generate appointment proposal |

## Labels (vs categories)

- **Category:** exactly one per email, AI-assigned, drives the cockpit tiles
  (*what kind of mail / what to do*).
- **Label:** zero-or-more per email, AI-assigned, cross-cutting tags for
  *project / customer / topic* (e.g. `Project Apollo`, `Acme Corp`, `Invoices`).
- **Correction → learning (with approval):** the user fixes a label in one tap,
  which changes only that email; MailAI then **proposes** a rule ("Always tag mail
  from X as Y?") that the user **approves or declines**. On approval the rule is
  saved (keyed by sender), applied to all mail from that sender, and fed back as
  few-shot so `suggest_labels` improves over time (mirrors the category correction
  loop). Nothing is generalised until approved.
- **Per-label cockpit:** tapping a label opens a mini-cockpit for that
  customer/project — a label-coloured hero (need-you vs just-info) and buckets
  **Needs attention · To reply · Waiting · Just info**, plus that label's open
  tasks and a "top of the pile" preview; each bucket drills into a filtered list.

## Mirror to Gmail (categories + labels as Gmail labels)

Gmail's only user-creatable organizing primitive is the **label** (its built-in
Primary/Social/Promotions "categories" are a fixed system set you can't extend).
So to make MailAI's category/labels visible in the Gmail app, they must become
Gmail labels. A **Settings → "Show in Gmail"** toggle (off by default) controls this:

- **Category → the "main" Gmail label** (exactly one per mail): `MailAI/Urgent`,
  `MailAI/Delivery`, …
- **Labels → extra Gmail labels** (zero-or-more): `MailAI/Acme Corp`,
  `MailAI/Project Apollo`, …
- Everything nests under one **`MailAI/`** parent so it collapses into a single
  group in Gmail's sidebar and can be hidden or bulk-removed in one step.

In MailAI they stay two distinct concepts (category drives the cockpit tiles;
labels are cross-cutting tags); in Gmail they're all just labels — "one flow",
visible and searchable. When on, `orchestrator.process_account()` calls
`GmailClient.ensure_label()` (get-or-create, nesting by `/`) + `apply_label()`
on each synced mail; correcting a label re-mirrors that mail (`_mirror_one`).
The toggle persists per user (`settings.mirror_gmail`); demo mode shows an
**"In Gmail"** preview of the resulting label names but writes nothing. Two-way
sync (relabel in Gmail → MailAI notices) and un-applying removed labels are live
follow-ups.

## Onboarding & the archive-first model

- **First connect files existing mail** to the Archive so the cockpit starts
  **clean**; only mail arriving after connect lands in the cockpit.
- **Move to cockpit**: any filed mail can be promoted into the live cockpit in one
  tap (removes the archived state). This is how you pull history in as you want it.
- **Empty cockpit anytime**: Settings → *File everything to Archive* re-runs the
  "start clean" whenever you like.
- **Group vs individual archive**: archiving a grouped card (or its "Archive all")
  files the **whole group**; archiving a single message from its detail files just
  that one.

## Grouping (threads by "thing")

Mail about the **same item** collapses into one card showing the **latest**, with
the earlier ones collapsed beneath (tap to expand). Grouped by the detector key —
delivery `tracking_number`, purchase `order_id`, travel `trip_id`, ticket
confirmation — so all updates for one parcel/order/trip read as a single entry.

## Archive cockpit

A dedicated screen (bottom nav → **Archive**) showing **filed** mail still
categorized (a tile per category), with **per-item delete, per-category
delete-all, and Empty archive**. A **Snoozed** section lists snoozed mail with
its wake time and a **Wake now** action. So you can delete directly, or file
first and clear it out here in bulk.

## Archive vs delete

- **Archive ("file it")** removes a mail from the cockpit (tiles, counts, category
  lists) but **keeps it under its labels** — it moves to that label's **Filed**
  bucket in the per-label cockpit, with labels intact. Restorable to the inbox.
- **Delete** removes the mail everywhere (including from labels).
- **Snooze** (swipe right) temporarily hides a mail from everywhere until it's due.
- Swipe left = archive, swipe right = snooze.

## Tasks & agenda

Extracted from emails; each task **keeps a link to its source mail** (tap a task
→ open the email). Tasks can be created from an email (whole email or a specific
extracted action). Cockpit ↔ Tasks reachable from the bottom nav and the sticky
top-right actions.

- **Propose meeting for agenda:** alongside "create task", an email detail offers
  **+ Propose meeting for agenda**. When the mail reads as scheduling (meet /
  call / "are you around" / availability…) MailAI flags it and suggests it. It
  opens a slot chooser (a few proposed times), and picking one adds an
  **appointment to the agenda** (shown on the Tasks screen) with an **Add to
  Google Calendar** link (opens Google Calendar's new-event screen prefilled —
  no copy to write), plus *Send proposal* / *Remove*. Mirrors
  `detect_scheduling_intent` + `generate_appointment_proposal`.
- **Agenda view (Google Calendar):** the Tasks screen's Agenda has an **Open
  Google Calendar** link and a **calendar selector** — toggle chips to pull
  additional calendars (Personal / Work / Family / Holidays / your own) into the
  view, so it shows the same events you'd see in Google Calendar. Selected
  calendars persist. Demo seeds sample calendars/events; live reads calendars +
  events via the Google Calendar API (added scope) — a follow-up.

## Intelligence functions (intelligence.py)

```python
classify_email(email) -> category: str
summarize_thread(messages) -> summary: str          # 2-3 sentences
extract_tasks(email) -> list[dict]                  # [{task, due_date}]
draft_reply(email, tone="professional") -> str
detect_ticket(email) -> dict | None                 # {type, event, date, seat, barcode_url}
detect_delivery(email) -> dict | None               # {carrier, tracking_number, status, eta, pickup_location, pickup_code}
detect_purchase(email) -> dict | None               # {merchant, order_id, total, currency, items}
detect_travel(email) -> dict | None                 # {type, provider, origin, destination, depart, arrive, confirmation, trip_id}
suggest_labels(email, labels, corrections) -> list[str]  # AI label assignment, learns from corrections
detect_scheduling_intent(email) -> bool
detect_request_in_sent(email) -> bool               # for follow-up reminders
generate_appointment_proposal(email) -> str         # ready-to-send reply with time slots
suggest_followup_date(email) -> date
```

## iPhone UI screens

### Cockpit — Start screen (default)
- **Account switcher** at the top (All mail · Work · Private · …) — filters the whole cockpit; every tile count respects it
- Total-overview dashboard: a grid of **tiles**, one per category
- Each tile shows the category name, a live **count** of mails/actions, and a short action hint (e.g. "2 need action", "1 ready for pickup", "1 overdue")
- Tap a tile → drills into that category's list (the Category view below)
- Header shows a two-stat summary: "need you today" vs "auto-handled"
- Tiles reflect the user's category config (order, visibility, custom categories) from Settings
- Bottom nav: Cockpit / Tasks / Settings

### Home / Category view — Category tabs
- Tabs: Urgent · Reply · Newsletter · Junk · Tickets · Deliveries · Purchases · Travel · Waiting
- Email cards show: sender, subject, AI summary snippet, timestamp
- Swipe left → Archive | Delete | Snooze options
- Bottom nav: Home / Tasks / Settings

### Newsletter screen
- Checkbox list of newsletters
- Each row: [Unsubscribe] [Archive] buttons
- Unsubscribe = auto-call the List-Unsubscribe header URL
- [Archive All Selected] bulk action button

### Email detail screen
- AI summary card at top
- Extracted tasks list
- Suggested reply with [Send] [Edit] [Discard]
- [Archive] [Delete] at bottom
- "Wrong category?" correction link → saves correction as rule

### Tickets screen
- Cards for event tickets, boarding passes, receipts/reservations
- [Add to Wallet] button → generates .pkpass and delivers via email attachment or Pass4wallet

### Waiting screen (sent follow-ups)
- Emails sent with a request, no reply yet
- Shows days since sent, highlights overdue
- [Follow up] → generates polite follow-up reply
- [Done] → dismiss reminder
- Auto-dismisses when reply arrives

### Settings / Rules screen
- **Language (English / Dutch):** a toggle switches **all of MailAI's own UI**
  (labels, categories, buttons, headings, toasts) between English and Dutch.
  Email content (senders, subjects, bodies) is never machine-translated — only
  the app chrome changes. Persists per user (`settings.lang`); the frontend
  translates via an English→Dutch phrase dictionary + a post-render text pass.
- **Show in Gmail:** the mirror toggle (see "Mirror to Gmail" above).
- **Cockpit categories:** reorder (drag), toggle visibility, and **add custom categories** — each becomes a cockpit tile. Custom categories carry a name, color/icon, and a plain-language definition used by the classifier.
- Plain-language classification rules
- Add / edit / delete rules
- Example: "Emails from my boss are always urgent"
- Correction history shown here too

## Apple Wallet integration

Ticket types and pass styles:
- Event tickets → `EventTicket` pass (barcode, seat, date)
- Boarding passes → `BoardingPass` pass (flight, gate, barcode)
- Receipts & reservations → `Generic` pass (merchant, amount, conf#)

Delivery method:
1. **Prototype:** Use Pass4wallet iOS app — generate pass URL, user opens in Pass4wallet
2. **Production:** Email `.pkpass` attachment → iPhone shows "Add to Wallet"

## MCP tools (server.py)

```
list_emails(query, max_results)
get_email(message_id)
archive_email(message_id)
delete_email(message_id)
apply_label(message_id, label)
create_draft(to, subject, body)
send_email(to, subject, body, thread_id)
mark_read(message_id)
list_sent(max_results)
```

## Setup

1. Create Google Cloud project → enable Gmail API → download `credentials.json`
2. `pip install -r requirements.txt`
3. Set `ANTHROPIC_API_KEY` in `.env`
4. `python auth.py` → OAuth2 consent → saves `token.json`
5. `python server.py` → starts MCP server
6. Open `ui/index.html` on iPhone via local network

## Multi-user & multi-account

- **Multi-user (multi-tenant):** each user authenticates and sees only their own
  data. All storage is keyed by `user_id`; never allow cross-user access.
- **Multiple mail accounts per user:** a user can connect several Gmail accounts
  (e.g. **Work**, **Private**), each with its own OAuth token. Accounts are
  **clearly separated** everywhere:
  - Cockpit has an account switcher — **All mail · Work · Private · …** — that
    filters every tile count and list to the selection.
  - Every email carries an account tag; categories, tasks, and waiting respect
    the active account.
  - Settings → **Mail accounts**: connect / label / colour / remove accounts.
- **Data model:** `user_id → accounts[] → messages` (each message tagged with
  `account_id`). OAuth tokens stored per `(user_id, account_id)`. Only mix
  accounts when "All mail" is selected.

## Key behaviours to implement carefully

- **Sent-mail monitoring:** After sending, run `detect_request_in_sent()`. If true, store in `waiting` list with suggested follow-up date. Poll sent/inbox to auto-dismiss when reply arrives.
- **Unsubscribe:** Parse `List-Unsubscribe` header. If `mailto:`, send email. If `https://`, call URL. Confirm to user after.
- **Correction loop:** When user clicks "Wrong category", save `{email_snippet, wrong_label, correct_label}` to `corrections.json`. Include last 10 corrections in the classification prompt as few-shot examples.
- **Ticket detection:** Look for keywords (ticket, booking, confirmation, reservation, flight, seat, gate, barcode, QR) + attachments + sender domains (ticketmaster.com, eventbrite.com, booking.com, klm.com, etc.)

## Coding conventions

- Python 3.11+
- Type hints on all functions
- `.env` for all secrets — never hardcode
- Mobile CSS: use `env(safe-area-inset-*)`, `touch-action: pan-y` for swipe
- All Claude API calls go through `intelligence.py` — no direct `anthropic` calls elsewhere
