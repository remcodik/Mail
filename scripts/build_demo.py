#!/usr/bin/env python3
"""Bundle ui/{style.css,fixtures.js,app.js} into a single self-contained ui/demo.html."""
from pathlib import Path

ui = Path(__file__).resolve().parent.parent / "ui"
css = (ui / "style.css").read_text()
fixtures = (ui / "fixtures.js").read_text()
app = (ui / "app.js").read_text()

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#0FA398">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>MailAI</title>
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
