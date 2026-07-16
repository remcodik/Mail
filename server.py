"""Dev entry point: `python server.py` runs the MailAI backend + UI.

Serves the API and the ui/ SPA on http://localhost:8000 (override with PORT).
In demo mode (default) no secrets are required. For production, run under a
proper ASGI server / container (see Dockerfile and docs/SETUP.md).
"""
import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=bool(os.getenv("MAILAI_RELOAD")),
    )
