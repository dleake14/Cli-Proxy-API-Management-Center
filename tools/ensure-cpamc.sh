#!/usr/bin/env bash
# Keep the CPAMC localhost server running. Silent background watchdog.
# Single check: exits 0 when http://127.0.0.1:5173/ answers, else restarts
# `bun run dev` detached (headless, no user interruption).
#   ensure-cpamc.sh            single check + restart when down
#   ensure-cpamc.sh --daemon   loop every 30s (runs detached via setsid)
#   ensure-cpamc.sh --cron     same as single check (cron / Task Scheduler)
set -u
ROOT="/home/david/forks/cpamc"
BUN="/home/david/.bun/bin/bun"
URL="http://127.0.0.1:5173/"
OUT_LOG="$ROOT/.cpamc-dev.out.log"
ERR_LOG="$ROOT/.cpamc-dev.err.log"
WATCH_LOG="$ROOT/.cpamc-watchdog.log"
LOCK_FILE="/tmp/cpamc-dev.lock"
INTERVAL=30

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$WATCH_LOG" 2>/dev/null || true; }

up() { curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; }

start_server() {
  (
    flock -n 9 || exit 0
    up && exit 0
    log "down: restarting bun run dev"
    cd "$ROOT" || exit 1
    setsid -f "$BUN" run dev </dev/null >>"$OUT_LOG" 2>>"$ERR_LOG"
    sleep 5
    if up; then log "restart ok"; else log "restart FAILED (still down)"; fi
  ) 9>"$LOCK_FILE"
}

case "${1:-}" in
  --daemon)
    log "daemon started (interval ${INTERVAL}s)"
    while true; do start_server; sleep "$INTERVAL"; done
    ;;
  --cron | "") start_server ;;
  *) echo "usage: $0 [--daemon|--cron]" >&2; exit 2 ;;
esac
