"""Flask web server — serves UI, REST API, and OAuth2 callback."""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template_string, request, session, url_for

import auth
import orchestrator
from intelligence import save_correction
from version import VERSION, BUILD_DATE, VERSION_LABEL

load_dotenv()

app = Flask(__name__, static_folder="ui", static_url_path="/static")
app.secret_key = os.getenv("FLASK_SECRET_KEY", secrets.token_hex(32))

UI_DIR = Path("ui")


# ── serve UI ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    with open(UI_DIR / "index.html") as f:
        return f.read()


@app.route("/static/<path:filename>")
def static_files(filename):
    from flask import send_from_directory
    return send_from_directory("ui", filename)


# ── version ───────────────────────────────────────────────────────────────────

@app.route("/api/version")
def api_version():
    return jsonify({"version": VERSION, "build_date": BUILD_DATE, "label": VERSION_LABEL})


# ── accounts ──────────────────────────────────────────────────────────────────

@app.route("/api/accounts")
def api_accounts():
    return jsonify(auth.get_accounts())


@app.route("/api/accounts/add")
def api_accounts_add():
    redirect_uri = url_for("oauth2callback", _external=True)
    auth_url, state = auth.get_authorization_url(redirect_uri)
    session["oauth_state"] = state
    return redirect(auth_url)


@app.route("/oauth2callback")
def oauth2callback():
    redirect_uri = url_for("oauth2callback", _external=True)
    authorization_response = request.url
    try:
        email = auth.exchange_code_for_token(redirect_uri, authorization_response)
        return redirect(f"/?account_added={email}")
    except Exception as e:
        return f"<h2>Login failed</h2><p>{e}</p><a href='/'>Back</a>", 400


@app.route("/api/accounts/<email>/remove", methods=["POST"])
def api_remove_account(email: str):
    auth.remove_account(email)
    return jsonify({"ok": True})


# ── inbox ─────────────────────────────────────────────────────────────────────

@app.route("/api/inbox/<account_email>")
def api_inbox(account_email: str):
    try:
        emails = orchestrator.process_inbox(account_email)
        return jsonify(emails)
    except FileNotFoundError:
        return jsonify({"error": "account_not_authenticated"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/inbox/all")
def api_inbox_all():
    accounts = auth.get_accounts()
    results: list[dict] = []
    for acc in accounts:
        try:
            results.extend(orchestrator.process_inbox(acc["email"]))
        except Exception:
            pass
    return jsonify(results)


# ── email actions ─────────────────────────────────────────────────────────────

def _client(account_email: str):
    from gmail_client import GmailClient
    return GmailClient(account_email)


@app.route("/api/email/<account_email>/<msg_id>/archive", methods=["POST"])
def api_archive(account_email: str, msg_id: str):
    _client(account_email).archive_email(msg_id)
    return jsonify({"ok": True})


@app.route("/api/email/<account_email>/<msg_id>/delete", methods=["POST"])
def api_delete(account_email: str, msg_id: str):
    _client(account_email).delete_email(msg_id)
    return jsonify({"ok": True})


@app.route("/api/email/<account_email>/<msg_id>/unsubscribe", methods=["POST"])
def api_unsubscribe(account_email: str, msg_id: str):
    result = _client(account_email).unsubscribe(msg_id)
    return jsonify({"action": result})


@app.route("/api/email/<account_email>/<msg_id>/send_reply", methods=["POST"])
def api_send_reply(account_email: str, msg_id: str):
    data = request.json or {}
    body = data.get("body", "")
    to = data.get("to", "")
    subject = data.get("subject", "")
    thread_id = data.get("thread_id")
    _client(account_email).send_email(to, subject, body, thread_id)
    return jsonify({"ok": True})


@app.route("/api/email/<account_email>/<msg_id>/correct", methods=["POST"])
def api_correct(account_email: str, msg_id: str):
    data = request.json or {}
    # Fetch email snippet for the correction record
    try:
        email = _client(account_email).get_email(msg_id)
    except Exception:
        email = {"snippet": ""}
    save_correction(email, data.get("wrong", ""), data.get("correct", ""))
    return jsonify({"ok": True})


# ── waiting / follow-up ───────────────────────────────────────────────────────

@app.route("/api/waiting")
def api_waiting():
    account = request.args.get("account")
    return jsonify(orchestrator.get_waiting(account))


@app.route("/api/waiting/<msg_id>/dismiss", methods=["POST"])
def api_dismiss_waiting(msg_id: str):
    orchestrator.dismiss_waiting(msg_id)
    return jsonify({"ok": True})


# ── tasks ─────────────────────────────────────────────────────────────────────

@app.route("/api/tasks")
def api_tasks():
    account = request.args.get("account")
    return jsonify(orchestrator.get_tasks(account))


# ── sent processing ───────────────────────────────────────────────────────────

@app.route("/api/process_sent/<account_email>", methods=["POST"])
def api_process_sent(account_email: str):
    orchestrator.process_sent(account_email)
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    # 0.0.0.0 so iPhone on the same network can reach the server
    app.run(host="0.0.0.0", port=port, debug=False)
