#!/usr/bin/env python3
"""Test-only mock of the CLIProxyAPI management API.

Serves the BUILT CPAMC bundle so the quota page can be rendered headlessly
without the operator's real management key. It answers just enough endpoints
for login (config) + the quota page (auth-files).

Not a product surface. Verification harness only.
"""
from __future__ import annotations

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BUNDLE = Path(sys.argv[1])
AUTH_DIR = Path.home() / ".cli-proxy-api"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8399


def auth_files_payload() -> dict:
    """List the operator's real credentials, exactly as the backend labels them.

    Deliberately contains NO ollama entry - that is the point: the backend can
    never list Ollama, so this proves the fork's synthetic card appears anyway.
    """
    files = []
    for path in sorted(AUTH_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        provider = path.name.split("-", 1)[0]
        files.append(
            {
                "name": path.name,
                "provider": provider,
                "type": provider,
                "email": data.get("email") or data.get("user") or provider,
                "auth_index": f"{provider}:{path.name}",
                "mtime": int(path.stat().st_mtime),
            }
        )
    return {"files": files}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args) -> None:  # silence
        pass

    def _json(self, obj: dict, code: int = 200) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        # SPA routes (/quota, /auth-files, ...) must serve the app, not JSON.
        if not path.startswith("/v0/management"):
            body = BUNDLE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.endswith("/config"):
            self._json(
                {
                    "server_version": "test-mock",
                    "port": PORT,
                    "host": "127.0.0.1",
                    "api-keys": [],
                    "auth-dir": str(AUTH_DIR),
                    "routing": {"strategy": "round-robin"},
                }
            )
            return
        if path.endswith("/auth-files"):
            self._json(auth_files_payload())
            return
        if path.endswith("/version"):
            self._json({"version": "test-mock", "build_date": time.strftime("%Y-%m-%d")})
            return
        # Anything else the boot sequence asks for: answer empty-but-successful.
        self._json({})

    def do_PATCH(self) -> None:
        self._json({})

    def do_POST(self) -> None:
        self._json({})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
