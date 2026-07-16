"""Seed inbox for demo mode — mirrors ui/fixtures.js so the served API returns
the same data the static prototype uses. Presentation (icons) lives in the
frontend, keyed by category id; the data layer stays presentation-free.
"""
from __future__ import annotations
import copy


def _accounts():
    return [
        {"id": "work", "name": "Work", "email": "remco@northwind.co", "color": "#3E7BF0"},
        {"id": "private", "name": "Private", "email": "dik.remco@gmail.com", "color": "#0FA398"},
    ]


def _categories():
    C = lambda i, n, col, hint, vis=True, builtin=True: {
        "id": i, "name": n, "color": col, "hint": hint, "visible": vis, "builtin": builtin}
    return [
        C("urgent", "Urgent", "var(--c-urgent)", "need action"),
        C("reply", "Reply", "var(--c-reply)", "drafts ready"),
        C("delivery", "Deliveries", "var(--c-delivery)", "in transit"),
        C("purchase", "Purchases", "var(--c-purchase)", "this week"),
        C("travel", "Travel", "var(--c-travel)", "upcoming"),
        C("newsletter", "Newsletter", "var(--c-news)", "unread"),
        C("ticket", "Tickets", "var(--c-ticket)", "for Wallet"),
        C("waiting", "Waiting", "var(--c-wait)", "overdue"),
        C("junk", "Junk", "var(--c-junk)", "auto-archived", vis=False),
        C("fyi", "FYI", "var(--c-fyi)", "read & filed", vis=False),
    ]


# account tag per message id (Work vs Private)
_ACCT = {
    "m1": "work", "m2": "private", "m3": "work", "m4": "private", "m5": "work",
    "m6": "work", "m7": "private", "m8": "private", "m9": "private", "m10": "private",
    "m11": "private", "m12": "work", "m13": "work", "m14": "work", "m15": "private",
    "m16": "private", "m17": "private", "m18": "private", "m19": "work", "m20": "work",
    "m21": "private", "m22": "private",
}


def _messages():
    m = [
        {"id": "m1", "cat": "urgent", "from": "Sarah Bennett", "initials": "SB", "av": "#E5484D", "time": "08:12",
         "subject": "Re: Q3 board deck — need numbers by noon",
         "snippet": "Can you get me the revised revenue slide before the 12:00 review? The chair specifically asked for it.",
         "chip": "Urgent", "ai": "Deadline today 12:00 · 1 task extracted", "needsAction": True,
         "summary": "Sarah needs the revised Q3 revenue slide before the 12:00 board review — the chair asked for it specifically.",
         "tasks": [{"text": "Send revised Q3 revenue slide to Sarah", "due": "Today · 12:00"},
                   {"text": "Confirm final figures with Finance", "due": "Today · 11:00"}],
         "reply": "Hi Sarah — sending the revised revenue slide by 11:30, ahead of the review. Confirming the figures with Finance first thing."},
        {"id": "m2", "cat": "urgent", "from": "Dr. Reyes' office", "initials": "DR", "av": "#B54708", "time": "07:40",
         "subject": "Appointment reminder — tomorrow 09:30",
         "snippet": "This is a reminder for your appointment. Reply C to confirm or R to reschedule.",
         "chip": "Urgent", "ai": "Wants a reply · confirm suggested", "needsAction": True,
         "summary": "Reminder for your appointment tomorrow at 09:30. Reply to confirm or reschedule.",
         "reply": "C — confirmed, see you at 09:30 tomorrow. Thank you."},
        {"id": "m3", "cat": "urgent", "from": "AWS Billing", "initials": "AW", "av": "#C11574", "time": "06:03",
         "subject": "Budget alert: 90% of monthly limit reached",
         "snippet": "Your account has reached 90% of the $500 budget you configured for July.",
         "chip": "Urgent", "summary": "Your AWS account hit 90% of the $500 July budget."},
        {"id": "m4", "cat": "reply", "from": "Jordan Lee", "initials": "JL", "av": "#E8912B", "time": "Yest",
         "subject": "Coffee next week?", "snippet": "Would love to catch up — are you around Tue or Wed afternoon?",
         "chip": "Reply needed", "ai": "Draft reply ready · proposes Tue 15:00",
         "summary": "Jordan wants to catch up over coffee, Tuesday or Wednesday afternoon.",
         "reply": "Tuesday at 15:00 works great for me — shall we say the usual place near your office?"},
        {"id": "m5", "cat": "reply", "from": "Maya Patel", "initials": "MP", "av": "#0E7C86", "time": "Yest",
         "subject": "Feedback on the onboarding copy", "snippet": "Left a few comments in the doc — mainly the welcome screen. Thoughts by Friday?",
         "chip": "Reply needed", "summary": "Maya left comments on the onboarding copy; wants your thoughts by Friday.",
         "reply": "Thanks Maya — the welcome-screen changes make sense. I’ll push an updated draft by Thursday."},
        {"id": "m6", "cat": "reply", "from": "Tomás Krause", "initials": "TK", "av": "#5B34C9", "time": "Mon",
         "subject": "Contract redlines attached", "snippet": "Please review section 4 and let me know if the payment terms work for you.",
         "chip": "Reply needed", "summary": "Tomás needs you to review section 4 (payment terms) and confirm."},
        {"id": "m7", "cat": "delivery", "from": "PostNL", "initials": "PN", "av": "#EA580C", "time": "08:55",
         "subject": "Out for delivery — arrives 13:00–15:00", "snippet": "Parcel 3SABC1234567890 is on the van today.",
         "chip": "Delivery", "ai": "Arrives today 13:00–15:00 · track live"},
        {"id": "m8", "cat": "delivery", "from": "DHL Parcel", "initials": "DH", "av": "#1E7FD6", "time": "Yest",
         "subject": "Ready for pickup — locker until 18 Jul", "snippet": "Collect at Albert Heijn, Overtoom 116 · locker 12. Code 8842.",
         "chip": "Pickup ready", "ai": "Pickup by 18 Jul · code 8842", "pickup": True},
        {"id": "m9", "cat": "delivery", "from": "Amazon", "initials": "AZ", "av": "#0E7C86", "time": "07:20",
         "subject": "Arriving today: USB-C cable + 2 items", "snippet": "Your order is arriving today by 9pm.", "chip": "Delivery"},
        {"id": "m10", "cat": "purchase", "from": "Apple", "initials": "AP", "av": "#15202B", "time": "06:40",
         "subject": "Your receipt from Apple · €12.99", "snippet": "Order W1234567 — iCloud+ 200GB monthly.",
         "chip": "Purchase", "ai": "Total €12.99 · order W1234567", "total": 12.99},
        {"id": "m11", "cat": "purchase", "from": "Zalando", "initials": "ZL", "av": "#D6336C", "time": "Yest",
         "subject": "Order confirmed — €89,95", "snippet": "2 items · running shoes + socks. Est. delivery 17 Jul.",
         "chip": "Order confirmed", "ai": "Links to Deliveries when it ships", "total": 89.95},
        {"id": "m12", "cat": "purchase", "from": "Uber Receipts", "initials": "UB", "av": "#276EF1", "time": "Mon",
         "subject": "Your Monday trip · €18,40", "snippet": "Centraal Station → Zuidas · 22 min.", "chip": "Receipt", "total": 18.40},
        {"id": "m13", "cat": "travel", "from": "KLM", "initials": "KL", "av": "#0EA5E9", "time": "Mon",
         "subject": "Your trip to New York — 22 Jul", "snippet": "AMS→JFK 10:05, returning 26 Jul. Check-in opens 23 Jul.",
         "chip": "Travel · Itinerary", "ai": "Trip grouped · flight + hotel + car in 8 days", "daysUntil": 8},
        {"id": "m14", "cat": "travel", "from": "Booking.com", "initials": "BK", "av": "#1E7FD6", "time": "Sun",
         "subject": "Hotel Pulitzer, Amsterdam — 2 nights", "snippet": "Check-in 22 Jul, check-out 24 Jul. Confirmation 4471.",
         "chip": "Travel · Stay", "daysUntil": 8},
        {"id": "m15", "cat": "newsletter", "from": "Stratechery", "initials": "ST", "av": "#3E7BF0", "time": "06:00",
         "subject": "The AI hardware question", "snippet": "Why the constraint has quietly moved from models to power…",
         "chip": "Newsletter", "ai": "One-tap unsubscribe available", "freq": "Daily", "unread": 22},
        {"id": "m16", "cat": "newsletter", "from": "Morning Brew", "initials": "MB", "av": "#B45309", "time": "05:30",
         "subject": "Weekend edition · 5 stories", "snippet": "Your curated selection for the week is ready.",
         "chip": "Newsletter", "freq": "Daily", "unread": 61},
        {"id": "m17", "cat": "newsletter", "from": "The Long Read", "initials": "TL", "av": "#2B7A3B", "time": "Fri",
         "subject": "This week’s deep dive", "snippet": "A curated long read for the weekend.", "chip": "Newsletter", "freq": "Weekly", "unread": 3},
        {"id": "m18", "cat": "ticket", "from": "Ticketmaster", "initials": "TM", "av": "#8257E6", "time": "Wed",
         "subject": "Your tickets: Radiohead — O2 Arena", "snippet": "18 Jul, 19:30. Seat B14.", "chip": "Event ticket",
         "ticket": {"style": "evt", "tt": "Event ticket · Ticketmaster", "ev": "Radiohead — O2 Arena",
                    "grid": [["Date", "18 Jul"], ["Time", "19:30"], ["Seat", "B14"]], "code": True}},
        {"id": "m19", "cat": "ticket", "from": "KLM", "initials": "KL", "av": "#1E7FD6", "time": "Mon",
         "subject": "Boarding pass — AMS → JFK", "snippet": "KL641 · Gate D7 · boards 10:05 · seat 7A.", "chip": "Boarding pass",
         "ticket": {"style": "board", "tt": "Boarding pass · KLM", "ev": "AMS → JFK · KL641",
                    "grid": [["Gate", "D7"], ["Boards", "10:05"], ["Seat", "7A"]], "code": True}},
        {"id": "m20", "cat": "waiting", "from": "Finance team", "initials": "FI", "av": "#0FA398", "time": "5d ago",
         "subject": "Approval on the vendor invoice?", "snippet": "Following up — still need sign-off before month end.",
         "chip": "Awaiting reply", "to": "Finance team", "days": 5, "overdue": True,
         "reply": "Hi — gentle nudge on this one. We need sign-off to release the vendor payment before month-end."},
        {"id": "m21", "cat": "waiting", "from": "Alex (recruiter)", "initials": "AR", "av": "#0E7C86", "time": "2d ago",
         "subject": "Availability for next round", "snippet": "Sent my availability — let me know which slot works.",
         "chip": "Awaiting reply", "to": "Alex (recruiter)", "days": 2, "overdue": False,
         "reply": "Hi Alex — just checking which of the slots I sent works best on your side."},
        {"id": "m22", "cat": "junk", "from": "Prize Draw", "initials": "PD", "av": "#8A94A6", "time": "Yest",
         "subject": "You have been selected!", "snippet": "Claim your reward now — limited time only.", "chip": "Junk"},
    ]
    for msg in m:
        msg["account"] = _ACCT.get(msg["id"], "private")
    return m


def fresh_inbox() -> dict:
    """A deep, independent copy for a user's tenant bucket."""
    return copy.deepcopy({
        "accounts": _accounts(),
        "categories": _categories(),
        "messages": _messages(),
    })
