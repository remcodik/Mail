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
    def __init__(self) -> None:
        self._users: dict[str, dict] = {}
        self._lock = RLock()

    # ---- tenant lifecycle ----
    def ensure_user(self, user_id: str, email: str | None = None, seed: bool = True) -> None:
        with self._lock:
            if user_id in self._users:
                return
            bucket = demo_seed.fresh_inbox() if seed else {"accounts": [], "categories": [], "messages": []}
            bucket["profile"] = {"id": user_id, "email": email or (user_id + "@example.com"), "name": "Remco"}
            self._users[user_id] = bucket

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
            "messages": self.messages(user_id, account=account),
        }

    # ---- writes (scoped to the user) ----
    def add_account(self, user_id: str, account: dict) -> None:
        with self._lock:
            self._bucket(user_id)["accounts"].append(account)

    def archive_message(self, user_id: str, message_id: str) -> bool:
        with self._lock:
            for m in self._bucket(user_id)["messages"]:
                if m["id"] == message_id:
                    m["archived"] = True
                    return True
        return False

    def set_category_visible(self, user_id: str, category_id: str, visible: bool) -> bool:
        with self._lock:
            for c in self._bucket(user_id)["categories"]:
                if c["id"] == category_id:
                    c["visible"] = visible
                    return True
        return False


store = Store()
