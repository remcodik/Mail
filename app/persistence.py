"""Durable storage for tenant buckets (encryption at rest).

Each user's bucket (accounts, categories, messages, tokens) is stored as one
encrypted JSON document keyed by `user_id`. OAuth tokens live inside that
document, so encrypting the whole blob keeps them safe at rest (#30). Every
backend exposes the same two methods (`load_all` / `save_user`) the in-memory
store calls, so they're drop-in:

- `SqlitePersistence`  — local file; enable with `MAILAI_DB` (needs durable disk).
- `FirestorePersistence` — Google Firestore; enable with `FIREBASE_CREDENTIALS`.
  Survives ephemeral hosts (e.g. Render free), so you stay signed in across
  restarts/sleeps without paying for a disk.
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


def _firebase_credentials(raw: str):
    """Parse a service-account credential from env. Accepts raw JSON or base64
    of the JSON (base64 is handy for pasting a key into one env var)."""
    raw = raw.strip()
    if not raw.startswith("{"):
        try:
            raw = base64.b64decode(raw).decode()
        except Exception:
            pass
    return json.loads(raw)


class FirestorePersistence:
    """One encrypted document per user in a Firestore collection. Same interface
    as SqlitePersistence, so it's a drop-in. Encrypts the whole bucket (tokens
    included) before it leaves the process, so Firestore only ever holds
    ciphertext. Enable by setting FIREBASE_CREDENTIALS (service-account key)."""

    def __init__(self, secret: str, credentials_info: dict,
                 collection: str = "mailai_tenants", project_id: str | None = None) -> None:
        import firebase_admin
        from firebase_admin import credentials as fb_credentials, firestore
        self._f = _fernet(secret)
        self._collection = collection
        cred = fb_credentials.Certificate(credentials_info)
        # initialize_app is a singleton per name; reuse if already set up.
        try:
            app = firebase_admin.get_app("mailai")
        except ValueError:
            opts = {"projectId": project_id} if project_id else None
            app = firebase_admin.initialize_app(cred, opts, name="mailai")
        self._db = firestore.client(app)

    def _col(self):
        return self._db.collection(self._collection)

    def load_all(self) -> dict:
        out: dict[str, dict] = {}
        for doc in self._col().stream():
            blob = (doc.to_dict() or {}).get("blob")
            if not blob:
                continue
            try:
                token = blob.encode() if isinstance(blob, str) else bytes(blob)
                out[doc.id] = json.loads(self._f.decrypt(token))
            except Exception:
                continue  # skip corrupt/undecryptable docs rather than crash
        return out

    def save_user(self, user_id: str, bucket: dict) -> None:
        blob = self._f.encrypt(json.dumps(bucket).encode()).decode()  # urlsafe-b64 str
        self._col().document(user_id).set({"blob": blob})
