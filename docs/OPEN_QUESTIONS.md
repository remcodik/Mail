# MailAI — Open questions & deferred decisions

Living log of things we've parked to decide/build later. Newest at top of each
section. Cross-referenced with GitHub issues where tracked.

Last updated: 2026-07-18

## Product / UX questions to decide

| # | Question | Context / options | Status |
|---|----------|-------------------|--------|
| Q1 | **Rule scope: sender vs domain vs subject** | ✅ Built (demo): the proposal lets you pick **This sender**, **Anyone @domain**, or **Subject…** (keyword match), plus an explicit "Add a label rule" in Settings. Backend still applies rules by sender — domain/subject scope server-side is a follow-up. | Done (demo); backend follow-up |
| Q16 | **UI language (English / Dutch)** | ✅ Built (demo + backend pref): a Settings toggle switches all of MailAI's chrome (labels, categories, buttons, headings, toasts) between English and Dutch via a phrase dictionary + post-render text pass; email content is never translated. `settings.lang` persists (localStorage + `/api/settings/lang`). Dictionary coverage is the visible chrome — dynamic count strings and custom label names pass through; broadening the dictionary is a follow-up. | Done (demo); dictionary-coverage follow-up |
| Q15 | **Propose meeting for agenda** | ✅ Built (demo): email detail offers "+ Propose meeting for agenda" (flagged when scheduling is detected) → slot chooser → an agenda entry on the Tasks screen with a ready-to-send proposal reply (*Send proposal* / *Remove*). Live wants a real Calendar/`generate_appointment_proposal` + free-slot lookup. | Done (demo); live Calendar follow-up |
| Q14 | **Categories/labels visible in Gmail** | ✅ Built: Gmail has only *labels* (its Primary/Social/Promotions categories are a fixed system set), so a MailAI category can only surface in Gmail as a label. Decision: **category → main Gmail label** (`MailAI/Urgent`), **labels → extra Gmail labels** (`MailAI/Acme Corp`), all under one `MailAI/` parent. A Settings **"Show in Gmail"** toggle (off by default) controls it; sync calls `ensure_label`+`apply_label`, label fixes re-mirror. Demo shows an "In Gmail" preview; live writes the labels. Two-way sync + un-applying removed labels are follow-ups. | Done (demo + backend); live verify follow-up |
| Q2 | **Auto-apply labels by fixed rule** | Besides learning from corrections, allow explicit user rules ("anything from @acme.com → Acme Corp") applied deterministically before the AI guess? | Open |
| Q3 | **Rule management UI** | ✅ Built (demo): Settings lists label + category rules each with a delete (✕); removing a rule cleanly reverts its effect (labels/categories recompute from the original AI assignment + remaining rules). | Done (demo) |
| Q11 | **Category correction loop** | ✅ Built (demo): "Category · tap to fix" on the detail screen; fixing proposes a sender/@domain rule you approve; rules recompute categories and are deletable. Mirrors the label loop (#15). | Done (demo); backend few-shot follow-up |
| Q13 | **Sent-mail follow-up reminders** | ✅ Built (demo): sending a reply that asks for something offers a "remind me to follow up" chooser (3 days / 1 week / 2 weeks) → creates a **Waiting** entry + a linked **Task**. Live needs real send + `detect_request_in_sent` + auto-dismiss when a reply arrives (spec "Sent-mail monitoring", #14). | Done (demo); live monitoring follow-up |
| Q12 | **Newsletter unsubscribe** | ✅ Built (demo): Unsubscribe now asks to confirm ("sends the List-Unsubscribe request, then files it"). Live call of the actual `List-Unsubscribe` URL/mailto (RFC 8058) is the backend follow-up (#12, gap G7). | Done (demo); live call follow-up |
| Q4 | **How autonomous?** | Should MailAI ever send/archive/delete/unsubscribe without an explicit tap? Current default: suggestion-only. | Leaning suggestion-only; confirm |
| Q5 | **Category vs label overlap for tickets/receipts** | Retail receipts → `purchase`; reservations/boarding → `ticket`; trips → `travel`. Confirm boundaries. | Proposed, needs sign-off (#24, #26) |
| Q6 | **Custom-category limit** | Soft cap on number of active cockpit categories before classification gets ambiguous/costly? | Open (suggested ~5–6) |
| Q7 | **Snooze / swipe actions** | ✅ Built (demo): swipe **left = archive**, **right = snooze** with a **timed chooser** (Later today / Tomorrow / Weekend / Next week); snoozed mail sits in the Archive cockpit with **Wake now**. **Timed auto-return** is now demoed via an "Advance demo clock" control that wakes due snoozes back into the cockpit. Live wants a real scheduler/clock. | Done (demo); live scheduler follow-up |
| Q9 | **Grouping related mail** | ✅ Built (demo): mail sharing a parcel/order/trip collapses into one card (latest on top, rest under a toggle). Grouping is by an inline `group` key in the demo; live grouping keys off detector fields (tracking/order/trip id). | Done (demo); live keying follow-up |
| Q10 | **Archive cockpit** | ✅ Built (demo): filed mail stays categorized under a dedicated Archive tab with per-item / per-category / empty-all delete, plus a Snoozed section. | Done (demo) |
| Q8 | **Label cockpit depth** | Per-label cockpit buckets = Needs attention / Reply / Waiting / Info (+ tasks). Are these the right buckets, or add e.g. Money (invoices/purchases) per customer? | **Being built** — feedback wanted |

## Technical decisions to make (before real use)

| # | Decision | Current state | Status |
|---|----------|---------------|--------|
| T1 | **Production datastore** | In-memory, or SQLite JSON blob per user with encrypted tokens (`MAILAI_DB`). Needs a real DB (Postgres) + migrations for production, and a volume on Fly. | Open (#30) |
| T2 | **User auth / login** | ✅ Built: live has **Sign in with Google** (`GET /api/login` → Google OAuth → `/api/accounts/callback` sets a signed session cookie; your email = your user id). `MAILAI_OWNER_EMAIL` restricts sign-in to your account. Demo still auto-logs-in. Needs a first live round-trip to verify; hardening (CSRF/state store, refresh) is a follow-up. | Done (backend); live verify follow-up |
| T3 | **Model ids** | Pinned `claude-haiku-4-5-…` (classify) / `claude-sonnet-5` (reason). Verify against the current model list at first live run. | Verify (#2) |
| T4 | **Polling vs push** | Sync is on-demand (`/api/accounts/{id}/sync`); live should use Gmail `history`/`watch` + Pub/Sub or a scheduler. | Open (#14) |
| T5 | **Sent-mail monitoring / auto-dismiss Waiting** | Not wired to live Gmail yet. | Open (#14) |
| T6 | **Apple Wallet `.pkpass` signing** | Needs an Apple Pass Type ID certificate (hard dependency). Prototype path = Pass4wallet. | Blocked on cert (#18) |
| T7 | **Rate limits / cost caps / privacy disclosure** | Not implemented; email bodies go to the Claude API. | Open (#21) |
| T8 | **Unsubscribe safety** | Must confirm before calling List-Unsubscribe URLs (RFC 8058). Stubbed in demo. | Open (#12) |

## Blocked on the user (to go live)

| # | Item | Needed from you |
|---|------|-----------------|
| U1 | Google Cloud OAuth client (Gmail API enabled) + redirect URI | client id/secret |
| U2 | Anthropic API key | key |
| U3 | Host + app name | Fly.io app (or another Docker host) |
| U4 | First live multi-account sync | run together once U1–U3 are set |

## Recently resolved

- **Multi-user + multiple accounts per user, clearly separated (Work/Private)** — decided & built.
- **Cockpit as the start screen with count tiles** — built.
- **Labels: AI-assigns, you fix, it learns — and now proposes the rule before applying** — built.
- **Tasks linked to their mail; create task from email** — built.
- **"Need you" vs "Auto-handled" made explicit + tappable** — built.
- **Timed snooze auto-return** — demoed via an "Advance demo clock" control; due snoozes wake back into the cockpit.
- **Task due-dates + inline edit** — tasks can be edited (text/due) and completed from the Tasks screen.
- **Account colour / rename / remove** — Settings → Mail accounts now manages each account's colour, label, and removal.
- **Subject-keyword rule scope** — label/category rule proposals can now scope to a keyword in the subject, not just sender/domain.
- **Mirror categories + labels to Gmail** — Settings toggle; category → main `MailAI/…` label, labels → extra `MailAI/…` labels, all under one parent. Visible in the Gmail app.
- **Propose meeting for agenda** — email detail can turn a scheduling mail into an agenda appointment with a ready-to-send proposal (parallel to "create task").
- **English / Dutch toggle** — Settings switches all MailAI UI text between English and Dutch; emails stay in their own language.
- **Sign in with Google** — live login now works (email = your account; `MAILAI_OWNER_EMAIL` locks it to you).
