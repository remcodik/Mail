"""Sync pipeline: fetch an account's inbox, classify + summarize each new
message with Claude, and store it. Idempotent — keyed by Gmail message id, so
re-running never double-creates.
"""
from __future__ import annotations
from .store import store
from .gmail_client import GmailClient
from . import intelligence

# classifier category ids -> the UI's cockpit category ids
_MAP = {
    "urgent": "urgent", "reply_needed": "reply", "newsletter": "newsletter",
    "junk": "junk", "fyi": "fyi", "ticket": "ticket", "delivery": "delivery",
    "purchase": "purchase", "travel": "travel", "awaiting_reply": "waiting",
    "scheduling": "reply",
}


_DETECTORS = {
    "delivery": intelligence.detect_delivery,
    "purchase": intelligence.detect_purchase,
    "travel": intelligence.detect_travel,
    "ticket": intelligence.detect_ticket,
}


def _cat_name(user_id: str, cat_id: str) -> str:
    for c in store.categories(user_id):
        if c["id"] == cat_id:
            return c["name"]
    return cat_id.title()


def gmail_label_names(user_id: str, msg: dict) -> list[str]:
    """The Gmail labels a message mirrors to: the category as the "main" label,
    then each cross-cutting label — all namespaced under "MailAI/". Mirrors the
    UI's gmailLabelNames() so app and Gmail agree."""
    names = ["MailAI/" + msg.get("chip", _cat_name(user_id, msg.get("cat", "mail")))]
    id2name = {l["id"]: l["name"] for l in store.labels(user_id)}
    for lid in msg.get("labels", []):
        names.append("MailAI/" + id2name.get(lid, lid))
    return names


def mirror_to_gmail(client: GmailClient, gmail_message_id: str, label_names: list[str]) -> None:
    """Ensure each label exists in Gmail and apply it to the message. Live only;
    best-effort — a mirror failure must never break the sync."""
    for name in label_names:
        try:
            client.apply_label(gmail_message_id, client.ensure_label(name))
        except Exception:
            pass


def _repair_meta(user_id: str, client: GmailClient, cap: int = 25) -> int:
    """Backfill fields on older stored mail saved before they existed: date/time
    (so the overview shows a date) and the attachments list (so the 'Get
    attachments' button can appear). Capped per sync; shrinks to a no-op once
    everything is filled."""
    fixed = 0
    for m in store.messages(user_id, account=client.account_id, include_archived=True):
        need_date = not (m.get("date") and m.get("time"))
        need_att = "attachments" not in m
        if not (need_date or need_att):
            continue
        try:
            fresh = client.get_message(m["id"])
        except Exception:
            continue
        patch = {"id": m["id"]}
        if need_date:
            patch["date"] = m.get("date") or fresh.get("date", "")
            patch["time"] = m.get("time") or fresh.get("time", "")
        if need_att:
            patch["attachments"] = fresh.get("attachments", [])
        store.upsert_message(user_id, patch)
        fixed += 1
        if fixed >= cap:
            break
    return fixed


def process_account(user_id: str, account_id: str, max_results: int = 25) -> int:
    """Classify + summarize new inbox mail for one account. Returns count processed."""
    token = store.get_token(user_id, account_id)
    if not token:
        raise RuntimeError(f"no OAuth token for account {account_id}")
    client = GmailClient(user_id, account_id, token)
    _repair_meta(user_id, client)   # backfill date + attachments on older stored mail
    valid = {c["id"] for c in store.categories(user_id)}
    mirror = store.get_settings(user_id).get("mirror_gmail", False)
    # First connect: file all existing mail to the Archive so the cockpit starts
    # clean. Later syncs bring genuinely new mail into the cockpit.
    first_sync = len(store.messages(user_id, account=account_id, include_archived=True)) == 0

    processed = 0
    for mid in client.list_message_ids(query="in:inbox", max_results=max_results):
        if store.has_message(user_id, mid):
            continue  # idempotent
        email = client.get_message(mid)
        raw_cat = intelligence.classify_email(email)
        cat = _MAP.get(raw_cat, "fyi")
        if cat not in valid:
            cat = "fyi"
        msg = {**email, "cat": cat, "chip": _cat_name(user_id, cat),
               "archived": first_sync}  # first connect files existing mail; new mail stays active
        if first_sync:
            # Baseline mail is filed to the Archive on first connect (start clean).
            # Categorise it (for the Archive tiles) but skip the expensive AI —
            # summaries/labels/drafts/detectors — so first connect is fast & cheap.
            msg["summary"] = email.get("snippet", "")
            msg["labels"] = []
        else:
            msg["summary"] = intelligence.summarize_thread([email])
            msg["labels"] = intelligence.suggest_labels(email, store.labels(user_id), store.label_corrections(user_id))
            if cat in ("urgent", "reply"):
                msg["needsAction"] = True
                msg["reply"] = intelligence.draft_reply(email)
            detector = _DETECTORS.get(cat)
            if detector:
                extracted = detector(email)
                if extracted:
                    msg["extracted"] = extracted
            # mirror category + labels into Gmail as "MailAI/…" labels, if opted in
            if mirror:
                mirror_to_gmail(client, mid, gmail_label_names(user_id, msg))
        store.upsert_message(user_id, msg)
        processed += 1
    return processed


def backfill_account(user_id: str, account_id: str, since: str = "2026/06/01",
                     max_results: int = 50) -> int:
    """Import received mail since a date and file it to the Archive, categorised
    only (fast/cheap — no summaries/labels/drafts). Idempotent, so it can be
    re-run to continue where it left off. Returns count imported."""
    token = store.get_token(user_id, account_id)
    if not token:
        raise RuntimeError(f"no OAuth token for account {account_id}")
    client = GmailClient(user_id, account_id, token)
    valid = {c["id"] for c in store.categories(user_id)}
    query = f"after:{since} -in:sent -in:chats -in:trash"   # received mail since the date
    processed = 0
    for mid in client.list_message_ids(query=query, max_results=max_results):
        if store.has_message(user_id, mid):
            continue
        email = client.get_message(mid)
        raw_cat = intelligence.classify_email(email)
        cat = _MAP.get(raw_cat, "fyi")
        if cat not in valid:
            cat = "fyi"
        store.upsert_message(user_id, {
            **email, "cat": cat, "chip": _cat_name(user_id, cat),
            "summary": email.get("snippet", ""), "labels": [], "archived": True,
        })
        processed += 1
    return processed


def sync_all(user_id: str, max_results: int = 25) -> dict[str, int]:
    """Sync every connected account for a user, keeping them separated."""
    return {a["id"]: process_account(user_id, a["id"], max_results)
            for a in store.accounts(user_id)}
