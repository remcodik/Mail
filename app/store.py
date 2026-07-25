"""In-memory multi-tenant store.

Every method is scoped by `user_id`; a user can only ever touch their own
bucket, which is the core isolation guarantee (#30). This is a dev/demo store;
the deployed backend swaps it for a real database with the same interface, still
keyed by `user_id`. Accounts within a user are kept separate by `account_id`.
"""
from __future__ import annotations
from threading import RLock
from . import demo_seed


class Store:
    def __init__(self, persistence=None) -> None:
        self._persistence = persistence
        self._users: dict[str, dict] = persistence.load_all() if persistence else {}
        self._lock = RLock()

    def _persist(self, user_id: str) -> None:
        if self._persistence and user_id in self._users:
            self._persistence.save_user(user_id, self._users[user_id])

    # ---- tenant lifecycle ----
    def ensure_user(self, user_id: str, email: str | None = None, seed: bool = True) -> None:
        with self._lock:
            if user_id in self._users:
                return
            if seed:
                bucket = demo_seed.fresh_inbox()
            else:
                # Live user: real category taxonomy, but no accounts/mail/labels until they act.
                bucket = {"accounts": [], "categories": demo_seed.default_categories(), "labels": [], "messages": []}
            bucket.setdefault("labels", [])
            bucket["profile"] = {"id": user_id, "email": email or (user_id + "@example.com"), "name": "Remco"}
            bucket["tokens"] = {}            # {account_id: oauth token dict}
            bucket["label_corrections"] = []  # [{sender, label_id, action}] — learning signal
            bucket["settings"] = {"mirror_gmail": False, "lang": "en"}  # user prefs
            self._users[user_id] = bucket
            self._persist(user_id)

    def _bucket(self, user_id: str) -> dict:
        # Isolation: never fall back to another user's data.
        if user_id not in self._users:
            raise KeyError("unknown user_id")
        return self._users[user_id]

    # ---- reads (scoped to the user) ----
    def profile(self, user_id: str) -> dict:
        return self._bucket(user_id)["profile"]

    def accounts(self, user_id: str) -> list[dict]:
        return self._bucket(user_id)["accounts"]

    def categories(self, user_id: str) -> list[dict]:
        return self._bucket(user_id)["categories"]

    def labels(self, user_id: str) -> list[dict]:
        return self._bucket(user_id).get("labels", [])

    def label_corrections(self, user_id: str) -> list[dict]:
        return self._bucket(user_id).get("label_corrections", [])

    def get_settings(self, user_id: str) -> dict:
        return self._bucket(user_id).setdefault("settings", {"mirror_gmail": False})

    def set_setting(self, user_id: str, key: str, value) -> None:
        with self._lock:
            self._bucket(user_id).setdefault("settings", {})[key] = value
            self._persist(user_id)

    def messages(self, user_id: str, account: str = "all", include_archived: bool = False) -> list[dict]:
        msgs = self._bucket(user_id)["messages"]
        out = []
        for m in msgs:
            if not include_archived and m.get("archived"):
                continue
            if account not in ("all", None) and m.get("account") != account:
                continue
            out.append(m)
        return out

    def inbox(self, user_id: str, account: str = "all") -> dict:
        b = self._bucket(user_id)
        return {
            "profile": b["profile"],
            "accounts": b["accounts"],
            "categories": b["categories"],
            "labels": b.get("labels", []),
            "settings": b.get("settings", {"mirror_gmail": False}),
            # include archived ("filed") mail so the UI can keep it under its labels
            # while hiding it from the cockpit; the client decides what's active.
            "messages": self.messages(user_id, account=account, include_archived=True),
        }

    # ---- writes (scoped to the user) ----
    def add_account(self, user_id: str, account: dict) -> None:
        with self._lock:
            accts = self._bucket(user_id)["accounts"]
            if any(a["id"] == account["id"] for a in accts):
                return
            accts.append(account)
            self._persist(user_id)

    # ---- OAuth tokens, stored per (user, account) ----
    def set_token(self, user_id: str, account_id: str, token: dict) -> None:
        with self._lock:
            self._bucket(user_id)["tokens"][account_id] = token
            self._persist(user_id)

    def get_token(self, user_id: str, account_id: str) -> dict | None:
        return self._bucket(user_id)["tokens"].get(account_id)

    # ---- message upsert (idempotent by id, e.g. Gmail message id) ----
    def upsert_message(self, user_id: str, msg: dict) -> None:
        with self._lock:
            msgs = self._bucket(user_id)["messages"]
            for i, m in enumerate(msgs):
                if m["id"] == msg["id"]:
                    msgs[i] = {**m, **msg}
                    self._persist(user_id)
                    return
            msgs.append(msg)
            self._persist(user_id)

    def has_message(self, user_id: str, message_id: str) -> bool:
        return any(m["id"] == message_id for m in self._bucket(user_id)["messages"])

    def archive_message(self, user_id: str, message_id: str) -> bool:
        with self._lock:
            for m in self._bucket(user_id)["messages"]:
                if m["id"] == message_id:
                    m["archived"] = True
                    self._persist(user_id)
                    return True
        return False

    def restore_message(self, user_id: str, message_id: str) -> bool:
        """Move a filed mail back into the cockpit (un-archive)."""
        with self._lock:
            for m in self._bucket(user_id)["messages"]:
                if m["id"] == message_id:
                    m["archived"] = False
                    m["snoozed"] = False
                    self._persist(user_id)
                    return True
        return False

    def delete_message(self, user_id: str, message_id: str) -> bool:
        """Remove a message everywhere for this user."""
        with self._lock:
            msgs = self._bucket(user_id)["messages"]
            for i, m in enumerate(msgs):
                if m["id"] == message_id:
                    del msgs[i]
                    self._persist(user_id)
                    return True
        return False

    def snooze_message(self, user_id: str, message_id: str, until: str, bucket: int) -> bool:
        """Hide a mail until it's due; persists the wake label + bucket."""
        with self._lock:
            for m in self._bucket(user_id)["messages"]:
                if m["id"] == message_id:
                    m["snoozed"] = True
                    m["snoozeUntil"] = until
                    m["snoozeBucket"] = bucket
                    self._persist(user_id)
                    return True
        return False

    def set_category_visible(self, user_id: str, category_id: str, visible: bool) -> bool:
        with self._lock:
            for c in self._bucket(user_id)["categories"]:
                if c["id"] == category_id:
                    c["visible"] = visible
                    self._persist(user_id)
                    return True
        return False

    def add_label_def(self, user_id: str, label: dict) -> None:
        with self._lock:
            labels = self._bucket(user_id).setdefault("labels", [])
            if not any(l["id"] == label["id"] for l in labels):
                labels.append(label)
                self._persist(user_id)

    def fix_label(self, user_id: str, message_id: str, label_id: str) -> dict:
        """Add/remove a label on a message, record the correction, and apply it to
        all mail from the same sender (the learning signal). Returns action + count."""
        with self._lock:
            b = self._bucket(user_id)
            src = next((m for m in b["messages"] if m["id"] == message_id), None)
            if not src:
                return {"action": "none", "updated": 0}
            sender = src.get("from")
            action = "add" if label_id not in src.get("labels", []) else "remove"
            corr = b.setdefault("label_corrections", [])
            corr[:] = [c for c in corr if not (c["sender"] == sender and c["label_id"] == label_id)]
            corr.append({"sender": sender, "label_id": label_id, "action": action})
            n = 0
            for m in b["messages"]:
                if m.get("from") != sender:
                    continue
                labels = m.setdefault("labels", [])
                if action == "add" and label_id not in labels:
                    labels.append(label_id)
                elif action == "remove" and label_id in labels:
                    labels.remove(label_id)
                n += 1
            self._persist(user_id)
            return {"action": action, "updated": n}


def make_store() -> "Store":
    """Pick a persistence backend from the environment, falling back to
    in-memory. Priority: Firestore (survives ephemeral hosts like Render free)
    > SQLite (needs a durable disk) > in-memory (data lost on restart)."""
    import os
    from .config import settings

    fb = os.getenv("FIREBASE_CREDENTIALS")
    if fb:
        try:
            from .persistence import FirestorePersistence, _firebase_credentials
            info = _firebase_credentials(fb)
            return Store(persistence=FirestorePersistence(
                settings.session_secret, info,
                collection=os.getenv("FIREBASE_COLLECTION", "mailai_tenants"),
                project_id=os.getenv("FIREBASE_PROJECT_ID") or info.get("project_id"),
            ))
        except Exception as e:  # bad key/lib missing: don't crash, fall through
            import logging
            logging.getLogger("mailai").warning("Firestore disabled: %s", e)

    path = os.getenv("MAILAI_DB")
    if path:
        from .persistence import SqlitePersistence
        return Store(persistence=SqlitePersistence(path, settings.session_secret))

    return Store()


store = make_store()
