# MailAI — Open questions & deferred decisions

Living log of things we've parked to decide/build later. Newest at top of each
section. Cross-referenced with GitHub issues where tracked.

Last updated: 2026-07-16

## Product / UX questions to decide

| # | Question | Context / options | Status |
|---|----------|-------------------|--------|
| Q1 | **Rule scope: sender vs domain** | ✅ Built (demo): the proposal now lets you pick **This sender** or **Anyone @domain**; plus an explicit "Add a label rule" in Settings. Backend still applies rules by sender — domain-scope server-side is a follow-up. Subject-keyword scope still open. | Done (demo); backend follow-up |
| Q2 | **Auto-apply labels by fixed rule** | Besides learning from corrections, allow explicit user rules ("anything from @acme.com → Acme Corp") applied deterministically before the AI guess? | Open |
| Q3 | **Rule management UI** | Where to view/edit/delete learned + manual rules (currently read-only list in Settings). Undo a learned rule? | Open |
| Q4 | **How autonomous?** | Should MailAI ever send/archive/delete/unsubscribe without an explicit tap? Current default: suggestion-only. | Leaning suggestion-only; confirm |
| Q5 | **Category vs label overlap for tickets/receipts** | Retail receipts → `purchase`; reservations/boarding → `ticket`; trips → `travel`. Confirm boundaries. | Proposed, needs sign-off (#24, #26) |
| Q6 | **Custom-category limit** | Soft cap on number of active cockpit categories before classification gets ambiguous/costly? | Open (suggested ~5–6) |
| Q7 | **Snooze / swipe actions** | ✅ Built (demo): swipe **left = archive**, **right = snooze** with a **timed chooser** (Later today / Tomorrow / Weekend / Next week); snoozed mail sits in the Archive cockpit with **Wake now**. Real clock-based auto-return is a backend follow-up. | Done (demo); auto-return follow-up |
| Q9 | **Grouping related mail** | ✅ Built (demo): mail sharing a parcel/order/trip collapses into one card (latest on top, rest under a toggle). Grouping is by an inline `group` key in the demo; live grouping keys off detector fields (tracking/order/trip id). | Done (demo); live keying follow-up |
| Q10 | **Archive cockpit** | ✅ Built (demo): filed mail stays categorized under a dedicated Archive tab with per-item / per-category / empty-all delete, plus a Snoozed section. | Done (demo) |
| Q8 | **Label cockpit depth** | Per-label cockpit buckets = Needs attention / Reply / Waiting / Info (+ tasks). Are these the right buckets, or add e.g. Money (invoices/purchases) per customer? | **Being built** — feedback wanted |

## Technical decisions to make (before real use)

| # | Decision | Current state | Status |
|---|----------|---------------|--------|
| T1 | **Production datastore** | In-memory, or SQLite JSON blob per user with encrypted tokens (`MAILAI_DB`). Needs a real DB (Postgres) + migrations for production, and a volume on Fly. | Open (#30) |
| T2 | **User auth / login** | Demo auto-logs-in a single user; live has signed-cookie sessions but **no real sign-in/identity provider** yet. | Open (#30) |
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
