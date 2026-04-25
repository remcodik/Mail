import os

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from gmail_client import GmailClient
from intelligence import draft_reply
from orchestrator import (
    dismiss_waiting,
    get_cached_emails,
    get_waiting,
    load_json,
    process_inbox,
    remove_from_cache,
    save_correction,
    save_json,
)

app = Flask(__name__, static_folder="ui")
CORS(app)

# ------------------------------------------------------------------
# Static UI
# ------------------------------------------------------------------

@app.get("/")
def index():
    return send_from_directory("ui", "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    return send_from_directory("ui", path)


# ------------------------------------------------------------------
# Emails
# ------------------------------------------------------------------

@app.get("/api/emails")
def list_emails():
    category = request.args.get("category")
    return jsonify(get_cached_emails(category))


@app.get("/api/email/<message_id>")
def get_email(message_id: str):
    for email in get_cached_emails():
        if email["id"] == message_id:
            return jsonify(email)
    return jsonify(GmailClient().get_email(message_id))


@app.post("/api/process")
def process():
    data = request.get_json(silent=True) or {}
    processed = process_inbox(data.get("max_results", 30))
    return jsonify({"processed": len(processed)})


@app.post("/api/email/<message_id>/archive")
def archive_email(message_id: str):
    GmailClient().archive_email(message_id)
    remove_from_cache(message_id)
    return jsonify({"ok": True})


@app.post("/api/email/<message_id>/delete")
def delete_email(message_id: str):
    GmailClient().delete_email(message_id)
    remove_from_cache(message_id)
    return jsonify({"ok": True})


@app.post("/api/email/<message_id>/reply")
def send_reply(message_id: str):
    data = request.get_json(silent=True) or {}
    body = data.get("body", "")
    client = GmailClient()

    emails = get_cached_emails()
    email = next((e for e in emails if e["id"] == message_id), None) or client.get_email(message_id)

    subject = email.get("subject", "")
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    client.send_email(email.get("from", ""), subject, body, thread_id=email.get("thread_id"))
    client.archive_email(message_id)
    remove_from_cache(message_id)
    return jsonify({"ok": True})


@app.post("/api/email/<message_id>/correct")
def correct_category(message_id: str):
    data = request.get_json(silent=True) or {}
    correct_label = data.get("correct_label", "")

    cache = load_json("emails_cache.json", [])
    for email in cache:
        if email["id"] == message_id:
            save_correction(email.get("snippet", "")[:100], email.get("category", ""), correct_label)
            email["category"] = correct_label
            break
    save_json("emails_cache.json", cache)
    return jsonify({"ok": True})


@app.post("/api/email/<message_id>/unsubscribe")
def unsubscribe(message_id: str):
    client = GmailClient()
    method = client.unsubscribe(message_id)
    client.archive_email(message_id)
    remove_from_cache(message_id)
    return jsonify({"ok": True, "method": method})


# ------------------------------------------------------------------
# Tasks
# ------------------------------------------------------------------

@app.get("/api/tasks")
def tasks():
    if os.path.exists("tasks.md"):
        with open("tasks.md") as f:
            lines = f.read().splitlines()
        return jsonify({"tasks": [l[6:] for l in lines if l.startswith("- [ ]")]})
    return jsonify({"tasks": []})


# ------------------------------------------------------------------
# Waiting / follow-up
# ------------------------------------------------------------------

@app.get("/api/waiting")
def waiting():
    return jsonify(get_waiting())


@app.post("/api/email/<message_id>/followup")
def followup(message_id: str):
    client = GmailClient()
    emails = get_cached_emails()
    email = next((e for e in emails if e["id"] == message_id), None) or client.get_email(message_id)

    body = draft_reply(email, tone="polite follow-up")
    subject = email.get("subject", "")
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    client.send_email(email.get("to", ""), subject, body, thread_id=email.get("thread_id"))
    dismiss_waiting(message_id)
    return jsonify({"ok": True, "body": body})


@app.post("/api/email/<message_id>/dismiss-waiting")
def dismiss_waiting_route(message_id: str):
    dismiss_waiting(message_id)
    return jsonify({"ok": True})


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
