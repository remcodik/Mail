"""Apple Wallet .pkpass generation for MailAI.

Prototype delivery: generates an unsigned .pkpass archive.
Open via Pass4wallet iOS app, or email as attachment for native Wallet prompt.

Production path: sign manifest.json with Apple Pass Type ID certificate +
WWDR intermediate cert to produce a valid 'signature' file.
"""

import hashlib
import json
import zipfile
from io import BytesIO

# Placeholders — override via env vars in production
PASS_TYPE_IDENTIFIER = "pass.com.mailai.prototype"
TEAM_IDENTIFIER = "XXXXXXXXXX"


def _build_pass_json(ticket_info: dict, email: dict) -> dict:
    """Return the pass.json dict for a given ticket type."""
    pass_type = ticket_info.get("type", "Generic")
    serial = hashlib.md5(email.get("id", "unknown").encode()).hexdigest()[:16]

    base: dict = {
        "formatVersion": 1,
        "passTypeIdentifier": PASS_TYPE_IDENTIFIER,
        "serialNumber": serial,
        "teamIdentifier": TEAM_IDENTIFIER,
        "organizationName": "MailAI",
        "description": ticket_info.get("event", "Ticket"),
        "backgroundColor": "rgb(255, 255, 255)",
        "foregroundColor": "rgb(0, 0, 0)",
        "labelColor": "rgb(100, 100, 100)",
    }

    date_val = ticket_info.get("date") or ""
    seat_val = ticket_info.get("seat") or ""
    event_val = ticket_info.get("event") or ""
    barcode_url = ticket_info.get("barcode_url") or ""

    if barcode_url:
        base["barcodes"] = [
            {"message": barcode_url, "format": "PKBarcodeFormatQR", "messageEncoding": "iso-8859-1"}
        ]

    if pass_type == "BoardingPass":
        base["boardingPass"] = {
            "transitType": "PKTransitTypeAir",
            "primaryFields": [
                {"key": "flight", "label": "FLIGHT", "value": event_val}
            ],
            "secondaryFields": [
                {"key": "date", "label": "DATE", "value": date_val},
                {"key": "seat", "label": "SEAT", "value": seat_val},
            ],
            "auxiliaryFields": [],
            "backFields": [],
        }

    elif pass_type == "EventTicket":
        base["eventTicket"] = {
            "primaryFields": [
                {"key": "event", "label": "EVENT", "value": event_val}
            ],
            "secondaryFields": [
                {"key": "date", "label": "DATE", "value": date_val},
                {"key": "seat", "label": "SEAT", "value": seat_val},
            ],
            "backFields": [],
        }

    else:  # Generic (receipts, reservations)
        base["generic"] = {
            "primaryFields": [
                {"key": "description", "label": "DESCRIPTION", "value": event_val}
            ],
            "secondaryFields": [
                {"key": "date", "label": "DATE", "value": date_val},
            ],
            "backFields": [],
        }

    return base


def generate_pkpass(ticket_info: dict, email: dict) -> BytesIO:
    """Build an unsigned .pkpass ZIP archive and return it as a BytesIO buffer.

    The archive contains pass.json and manifest.json.
    A production build would also include a CMS 'signature' file and icon assets.
    """
    pass_data = _build_pass_json(ticket_info, email)
    pass_bytes = json.dumps(pass_data, indent=2).encode("utf-8")

    manifest = {"pass.json": hashlib.sha1(pass_bytes).hexdigest()}
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("pass.json", pass_bytes)
        zf.writestr("manifest.json", manifest_bytes)
        # NOTE: Add 'signature' (CMS-signed manifest) and icon PNGs for production

    buf.seek(0)
    return buf
