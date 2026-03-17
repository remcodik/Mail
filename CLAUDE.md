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
| `awaiting_reply` | Sent email with request → create follow-up reminder |
| `scheduling` | Mentions meeting → generate appointment proposal |

## Intelligence functions (intelligence.py)

```python
classify_email(email) -> category: str
summarize_thread(messages) -> summary: str          # 2-3 sentences
extract_tasks(email) -> list[dict]                  # [{task, due_date}]
draft_reply(email, tone="professional") -> str
detect_ticket(email) -> dict | None                 # {type, event, date, seat, barcode_url}
detect_scheduling_intent(email) -> bool
detect_request_in_sent(email) -> bool               # for follow-up reminders
generate_appointment_proposal(email) -> str         # ready-to-send reply with time slots
suggest_followup_date(email) -> date
```

## iPhone UI screens

### Home — Category tabs
- Tabs: Urgent · Reply · Newsletter · Junk · Tickets · Waiting
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
