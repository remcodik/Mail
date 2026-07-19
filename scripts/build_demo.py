#!/usr/bin/env python3
"""Bundle ui/{style.css,fixtures.js,app.js} into a single self-contained ui/demo.html."""
from pathlib import Path

import base64

ui = Path(__file__).resolve().parent.parent / "ui"
css = (ui / "style.css").read_text()
fixtures = (ui / "fixtures.js").read_text()
app = (ui / "app.js").read_text()

# embed the home-screen icon as a data URI so the single-file demo is self-contained
_icon_b64 = base64.b64encode((ui / "apple-touch-icon.png").read_bytes()).decode()
_icon_uri = f"data:image/png;base64,{_icon_b64}"

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#0FA398">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="MailAI">
<title>MailAI</title>
<link rel="apple-touch-icon" href="{_icon_uri}">
<link rel="icon" type="image/png" href="{_icon_uri}">
<style>
{css}
</style>
</head>
<body>
<div class="shell"><div id="root"></div></div>
<script>
{fixtures}
</script>
<script>
{app}
</script>
</body>
</html>
"""

out = ui / "demo.html"
out.write_text(html)
print(f"Wrote {out} ({len(html)} bytes)")
