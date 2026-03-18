"""MCP + Flask server for MailAI.

Exposes:
  - MCP tools for Gmail operations (used by AI agents)
  - REST API endpoints for the iPhone web UI
"""

import json
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, session, url_for, send_from_directory
from flask_cors import CORS

import auth
import gmail_client as gmail
import intelligence as ai
import orchestrator as orch

load_dotenv()

app = Flask(__name__, static_folder="ui")
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))
CORS(app)

VERSION_FILE = Path("version.json")
CHANGELOG_FILE = Path("changelog.json")
RULES_FILE = Path("rules.json")


def _require_auth():
    """Return a 401 response if Gmail is not authenticated, else None."""
    if auth.get_credentials() is None:
        return jsonify({"error": "Not authenticated. Visit /auth/login"}), 401
    return None


# ── Static UI ─────────────────────────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory("ui", "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory("ui", filename)


# ── Gmail OAuth2 ──────────────────────────────────────────────────────────────

@app.route("/auth/login")
def auth_login():
    redirect_uri = url_for("auth_callback", _external=True)
    flow = auth.get_web_flow(redirect_uri)
    authorization_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    session["oauth_state"] = state
    return redirect(authorization_url)


@app.route("/auth/callback")
def auth_callback():
    redirect_uri = url_for("auth_callback", _external=True)
    flow = auth.get_web_flow(redirect_uri)
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    auth._save_credentials(creds)
    return """
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
    <h2>&#10003; Gmail connected!</h2>
    <p>You can now <a href="/">open the app</a>.</p>
    <p style="font-size:12px;color:#888">
      To keep auth across Render deploys, set this as <code>GOOGLE_TOKEN_JSON</code> env var:<br><br>
      <textarea rows="4" style="width:90%;font-size:11px">""" + creds.to_json() + """</textarea>
    </p>
    </body></html>
    """


def _load_json(path: Path, default) -> any:
    if path.exists():
        return json.loads(path.read_text())
    return default


# ── Version & Changelog ───────────────────────────────────────────────────────

@app.route("/api/version")
def api_version():
    return jsonify(_load_json(VERSION_FILE, {}))


@app.route("/api/changelog")
def api_changelog():
    return jsonify(_load_json(CHANGELOG_FILE, []))


# ── Inbox ─────────────────────────────────────────────────────────────────────

@app.route("/api/inbox")
def api_inbox():
    max_results = int(request.args.get("max", 20))
    emails = orch.process_inbox(max_results=max_results)
    return jsonify(emails)


@app.route("/api/email/<message_id>")
def api_get_email(message_id: str):
    email = gmail.get_email(message_id)
    return jsonify(email)


@app.route("/api/email/<message_id>/archive", methods=["POST"])
def api_archive(message_id: str):
    gmail.archive_email(message_id)
    return jsonify({"status": "archived"})


@app.route("/api/email/<message_id>/delete", methods=["POST"])
def api_delete(message_id: str):
    gmail.delete_email(message_id)
    return jsonify({"status": "deleted"})


@app.route("/api/email/<message_id>/label", methods=["POST"])
def api_label(message_id: str):
    data = request.json or {}
    gmail.apply_label(message_id, data["label"])
    return jsonify({"status": "labelled"})


@app.route("/api/email/<message_id>/correct", methods=["POST"])
def api_correct(message_id: str):
    data = request.json or {}
    email = gmail.get_email(message_id)
    ai.save_correction(
        snippet=email.get("snippet", ""),
        wrong_label=data["wrong"],
        correct_label=data["correct"],
    )
    gmail.apply_label(message_id, f"mailai/{data['correct']}")
    return jsonify({"status": "correction saved"})


# ── Reply & Draft ─────────────────────────────────────────────────────────────

@app.route("/api/email/<message_id>/draft-reply", methods=["POST"])
def api_draft_reply(message_id: str):
    data = request.json or {}
    email = gmail.get_email(message_id)
    tone = data.get("tone", "professional")
    draft = ai.draft_reply(email, tone=tone)
    return jsonify({"draft": draft})


@app.route("/api/email/<message_id>/send-reply", methods=["POST"])
def api_send_reply(message_id: str):
    data = request.json or {}
    email = gmail.get_email(message_id)
    sent = gmail.send_email(
        to=email["from"],
        subject=f"Re: {email['subject']}",
        body=data["body"],
        thread_id=email["thread_id"],
    )
    return jsonify(sent)


@app.route("/api/draft", methods=["POST"])
def api_create_draft():
    data = request.json or {}
    draft = gmail.create_draft(
        to=data["to"], subject=data["subject"], body=data["body"],
        thread_id=data.get("thread_id"),
    )
    return jsonify(draft)


# ── Newsletters ───────────────────────────────────────────────────────────────

@app.route("/api/newsletters")
def api_newsletters():
    return jsonify(orch.get_newsletters())


@app.route("/api/email/<message_id>/unsubscribe", methods=["POST"])
def api_unsubscribe(message_id: str):
    email = gmail.get_email(message_id)
    header = email.get("list_unsubscribe", "")
    if not header:
        return jsonify({"error": "No List-Unsubscribe header found"}), 400
    status = gmail.unsubscribe(header)
    gmail.archive_email(message_id)
    return jsonify({"status": status})


# ── Waiting / Follow-ups ──────────────────────────────────────────────────────

@app.route("/api/waiting")
def api_waiting():
    return jsonify(orch.get_waiting_emails())


@app.route("/api/waiting/<email_id>/dismiss", methods=["POST"])
def api_dismiss_waiting(email_id: str):
    orch.dismiss_waiting(email_id)
    return jsonify({"status": "dismissed"})


@app.route("/api/waiting/<message_id>/followup", methods=["POST"])
def api_followup(message_id: str):
    email = gmail.get_email(message_id)
    draft = ai.draft_reply(email, tone="polite follow-up")
    return jsonify({"draft": draft})


# ── Tasks ─────────────────────────────────────────────────────────────────────

@app.route("/api/tasks")
def api_tasks():
    tasks_file = Path("tasks.md")
    content = tasks_file.read_text() if tasks_file.exists() else "# Tasks\n\nNo tasks yet.\n"
    return jsonify({"content": content})


# ── Rules ─────────────────────────────────────────────────────────────────────

@app.route("/api/rules")
def api_rules():
    return jsonify(_load_json(RULES_FILE, []))


@app.route("/api/rules", methods=["POST"])
def api_add_rule():
    data = request.json or {}
    rules = _load_json(RULES_FILE, [])
    rules.append(data)
    RULES_FILE.write_text(json.dumps(rules, indent=2))
    return jsonify({"status": "added", "rule": data})


@app.route("/api/rules/<int:index>", methods=["DELETE"])
def api_delete_rule(index: int):
    rules = _load_json(RULES_FILE, [])
    if 0 <= index < len(rules):
        rules.pop(index)
        RULES_FILE.write_text(json.dumps(rules, indent=2))
    return jsonify({"status": "deleted"})


# ── Corrections history ───────────────────────────────────────────────────────

@app.route("/api/corrections")
def api_corrections():
    corrections_file = Path("corrections.json")
    return jsonify(_load_json(corrections_file, []))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("FLASK_PORT", 5000)))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    print(f"MailAI server starting on http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)
