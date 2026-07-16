"""Durable storage for tenant buckets (SQLite + encryption at rest).

Each user's bucket (accounts, categories, messages, tokens) is stored as one
encrypted JSON document keyed by `user_id`. OAuth tokens live inside that
document, so encrypting the whole blob keeps them safe at rest (#30). Same
interface the in-memory store uses, so it's a drop-in — set `MAILAI_DB` to enable.
"""
from __future__ import annotations
import base64
import hashlib
import json
import sqlite3
from threading import RLock


def _fernet(secret: str):
    from cryptography.fernet import Fernet  # lazy import
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


class SqlitePersistence:
    def __init__(self, path: str, secret: str) -> None:
        self.path = path
        self._f = _fernet(secret)
        self._lock = RLock()
        with self._con() as con:
            con.execute("CREATE TABLE IF NOT EXISTS tenants (user_id TEXT PRIMARY KEY, blob BLOB NOT NULL)")

    def _con(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def load_all(self) -> dict:
        out: dict[str, dict] = {}
        with self._lock, self._con() as con:
            for uid, blob in con.execute("SELECT user_id, blob FROM tenants"):
                try:
                    out[uid] = json.loads(self._f.decrypt(blob))
                except Exception:
                    continue  # skip corrupt/undecryptable rows rather than crash
        return out

    def save_user(self, user_id: str, bucket: dict) -> None:
        blob = self._f.encrypt(json.dumps(bucket).encode())
        with self._lock, self._con() as con:
            con.execute(
                "INSERT INTO tenants (user_id, blob) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET blob = excluded.blob",
                (user_id, blob),
            )
