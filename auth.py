"""OAuth2 flow for Gmail API authentication."""

import json
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
]

CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
TOKEN_FILE = os.getenv("GOOGLE_TOKEN_FILE", "token.json")


def _get_client_config() -> dict:
    """Load client config from GOOGLE_CREDENTIALS_JSON env var or credentials.json file."""
    raw = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if raw:
        return json.loads(raw)
    if Path(CREDENTIALS_FILE).exists():
        return json.loads(Path(CREDENTIALS_FILE).read_text())
    raise FileNotFoundError(
        "No Google credentials found. Set the GOOGLE_CREDENTIALS_JSON env var "
        f"or place credentials.json at: {CREDENTIALS_FILE}"
    )


def get_credentials() -> Credentials | None:
    """Return valid Gmail credentials, or None if not yet authenticated."""
    creds: Credentials | None = None

    # Cloud deployment: read token from env var
    token_json = os.getenv("GOOGLE_TOKEN_JSON")
    if token_json:
        creds = Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)
    elif Path(TOKEN_FILE).exists():
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_credentials(creds)

    return creds if (creds and creds.valid) else None


def _save_credentials(creds: Credentials) -> None:
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())


def get_web_flow(redirect_uri: str) -> Flow:
    """Create a web-based OAuth2 flow (for cloud / no-browser environments)."""
    return Flow.from_client_config(
        _get_client_config(), scopes=SCOPES, redirect_uri=redirect_uri
    )


if __name__ == "__main__":
    creds = get_credentials()
    if creds:
        print("Already authenticated. Token is valid.")
    else:
        print("Not authenticated. Start the server and visit /auth/login")
