"""OAuth2 flow for multiple Gmail accounts — web-based, works on iPhone and PC."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]

TOKENS_DIR = Path("tokens")
ACCOUNTS_FILE = Path("data/accounts.json")
SECRETS_FILE = os.getenv("GOOGLE_CLIENT_SECRETS_FILE", "credentials.json")

ACCOUNT_COLORS = [
    "#1a73e8",  # Google blue
    "#34a853",  # Google green
    "#ea4335",  # Google red
    "#fa7b17",  # Google orange
    "#9334e6",  # purple
    "#007b83",  # teal
]


def _load_accounts() -> list[dict]:
    if not ACCOUNTS_FILE.exists():
        return []
    with open(ACCOUNTS_FILE) as f:
        return json.load(f)


def _save_accounts(accounts: list[dict]) -> None:
    ACCOUNTS_FILE.parent.mkdir(exist_ok=True)
    with open(ACCOUNTS_FILE, "w") as f:
        json.dump(accounts, f, indent=2)


def get_accounts() -> list[dict]:
    """Return all registered accounts (no tokens, safe to send to frontend)."""
    return _load_accounts()


def get_account(email: str) -> dict | None:
    return next((a for a in _load_accounts() if a["email"] == email), None)


def create_auth_flow(redirect_uri: str) -> Flow:
    return Flow.from_client_secrets_file(
        SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )


def get_authorization_url(redirect_uri: str) -> tuple[str, str]:
    """Return (auth_url, state) to redirect the user to Google."""
    flow = create_auth_flow(redirect_uri)
    url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return url, state


def exchange_code_for_token(redirect_uri: str, authorization_response: str) -> str:
    """Exchange OAuth2 code for credentials, save token, return email address."""
    flow = create_auth_flow(redirect_uri)
    flow.fetch_token(authorization_response=authorization_response)
    creds = flow.credentials

    # Discover the account email
    from googleapiclient.discovery import build

    service = build("gmail", "v1", credentials=creds)
    profile = service.users().getProfile(userId="me").execute()
    email = profile["emailAddress"]

    # Save token
    TOKENS_DIR.mkdir(exist_ok=True)
    token_file = TOKENS_DIR / f"{email}.json"
    with open(token_file, "w") as f:
        f.write(creds.to_json())

    # Register account if not already present
    accounts = _load_accounts()
    if not any(a["email"] == email for a in accounts):
        color = ACCOUNT_COLORS[len(accounts) % len(ACCOUNT_COLORS)]
        accounts.append(
            {
                "email": email,
                "added": __import__("datetime").date.today().isoformat(),
                "color": color,
                "label": email.split("@")[0],
            }
        )
        _save_accounts(accounts)

    return email


def get_credentials(email: str) -> Credentials:
    """Load and refresh credentials for the given account."""
    token_file = TOKENS_DIR / f"{email}.json"
    if not token_file.exists():
        raise FileNotFoundError(f"No token for {email}. Re-authenticate.")

    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_file, "w") as f:
            f.write(creds.to_json())

    return creds


def remove_account(email: str) -> None:
    """Remove an account and its token."""
    token_file = TOKENS_DIR / f"{email}.json"
    if token_file.exists():
        token_file.unlink()
    accounts = [a for a in _load_accounts() if a["email"] != email]
    _save_accounts(accounts)
