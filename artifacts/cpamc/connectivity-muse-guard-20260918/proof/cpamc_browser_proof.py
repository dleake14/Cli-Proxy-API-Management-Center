"""Authenticated headless proof for the local CPAMC quota route."""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket


CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
KEY_FILE = Path(r"\\wsl.localhost\Ubuntu\home\david\.config\cli-proxy-api\management-key")
PAGE = "http://localhost:5173/#/quota"
API = "http://localhost:8317"
PORT = 19328
HERE = Path(__file__).resolve().parent


def command(ws, command_id: int, method: str, params: dict | None = None):
    ws.send(json.dumps({"id": command_id, "method": method, "params": params or {}}))
    deadline = time.time() + 12
    while time.time() < deadline:
        try:
            message = json.loads(ws.recv())
        except websocket.WebSocketTimeoutException:
            continue
        if message.get("id") == command_id:
            return message
    raise TimeoutError(method)


def main() -> int:
    profile = Path(tempfile.gettempdir()) / f"cpamc-proof-{os.getpid()}"
    process = subprocess.Popen(
        [
            str(CHROME),
            "--headless=new",
            f"--remote-debugging-port={PORT}",
            "--remote-allow-origins=*",
            f"--user-data-dir={profile}",
            "--window-size=936,1400",
            PAGE,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ws = None
    try:
        targets = None
        for _ in range(60):
            try:
                targets = json.load(
                    urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=1)
                )
                if targets:
                    break
            except Exception:
                time.sleep(0.2)
        if not targets:
            raise RuntimeError("proof browser did not start")
        target = next(item for item in targets if item.get("type") == "page")
        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=2)
        command(ws, 1, "Page.enable")
        command(ws, 2, "Runtime.enable")
        command(ws, 3, "Network.enable")

        command(
            ws,
            4,
            "Runtime.evaluate",
            {"expression": "localStorage.clear(); location.reload(); true", "returnByValue": True},
        )
        time.sleep(2)

        key = KEY_FILE.read_text().strip()
        expression = f"""
(() => {{
  const input = document.querySelector('input[name="cpa-management-key"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, {json.dumps(key)});
  input.dispatchEvent(new Event('input', {{ bubbles: true }}));
  const button = [...document.querySelectorAll('button')]
    .find((item) => /connect|login|sign in/i.test(item.textContent || ''));
  button?.click();
  return {{
    clicked: !!button,
    detectedBackend: (document.body?.innerText || '').includes('localhost:8317')
  }};
}})()
"""
        login_reply = command(
            ws, 5, "Runtime.evaluate", {"expression": expression, "returnByValue": True}
        )
        login_action = login_reply["result"]["result"].get("value") or {}

        console_errors: list[str] = []
        request_failures: list[str] = []
        deadline = time.time() + 15
        ws.settimeout(0.5)
        while time.time() < deadline:
            try:
                message = json.loads(ws.recv())
            except websocket.WebSocketTimeoutException:
                continue
            method = message.get("method")
            params = message.get("params") or {}
            if method == "Runtime.consoleAPICalled" and params.get("type") == "error":
                console_errors.append("console.error")
            elif method == "Runtime.exceptionThrown":
                console_errors.append("uncaught exception")
            elif method == "Network.loadingFailed" and not params.get("canceled"):
                request_failures.append(str(params.get("errorText") or "request failed"))
            if method == "Page.loadEventFired":
                time.sleep(1)
                break

        ws.settimeout(3)
        command(
            ws,
            6,
            "Runtime.evaluate",
            {"expression": "location.hash = '#/quota'; true", "returnByValue": True},
        )
        quota_status = {"total": 0, "loaded": 0, "attention": 0}
        quota_deadline = time.time() + 25
        while time.time() < quota_deadline:
            time.sleep(1)
            status_reply = command(
                ws,
                60,
                "Runtime.evaluate",
                {
                    "expression": """
(() => {
  const text = document.body?.innerText || '';
  const total = Number(text.match(/(\\d+) credentials/)?.[1] || 0);
  const loaded = Number(text.match(/(\\d+) loaded/)?.[1] || 0);
  const attention = Number(text.match(/(\\d+) need attention/)?.[1] || 0);
  return { total, loaded, attention };
})()
""",
                    "returnByValue": True,
                },
            )
            quota_status = status_reply["result"]["result"].get("value") or quota_status
            if quota_status["total"] > 0 and (
                quota_status["loaded"] + quota_status["attention"] >= quota_status["total"]
            ):
                break
        summary_reply = command(
            ws,
            7,
            "Runtime.evaluate",
            {
                "expression": """
JSON.stringify({
  href: location.href,
  title: document.title,
  heading: document.querySelector('h1,h2')?.textContent?.trim() || '',
  bodyHasQuota: (document.body?.innerText || '').includes('Quota Management'),
  bodyHasTimeline: (document.body?.innerText || '').toLowerCase().includes('quota windows'),
  authStatePresent: !!localStorage.getItem('cli-proxy-auth')
})
""",
                "returnByValue": True,
            },
        )
        summary = json.loads(
            summary_reply["result"]["result"].get("value") or "{}"
        )
        summary["loginAction"] = login_action
        summary["quotaStatus"] = quota_status
        shot_reply = command(ws, 8, "Page.captureScreenshot", {"format": "png"})
        screenshot = HERE / "cpamc-quota.png"
        screenshot.write_bytes(base64.b64decode(shot_reply["result"]["data"]))
        proof = {
            "route": PAGE,
            "summary": summary,
            "console_error_count": len(console_errors),
            "request_failure_count": len(request_failures),
            "screenshot": screenshot.name,
        }
        (HERE / "browser-proof.json").write_text(
            json.dumps(proof, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(proof))
        quota_complete = (
            quota_status["total"] > 0
            and quota_status["loaded"] + quota_status["attention"] >= quota_status["total"]
        )
        return (
            0
            if summary.get("bodyHasQuota")
            and quota_complete
            and not console_errors
            and not request_failures
            else 1
        )
    finally:
        if ws is not None:
            try:
                command(ws, 99, "Browser.close")
            except Exception:
                pass
            ws.close()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
