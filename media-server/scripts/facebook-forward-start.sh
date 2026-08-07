#!/usr/bin/env bash
# Start ffmpeg RTMP forward to Facebook Live when facebookForwardEnabled.
set -euo pipefail

log() { echo "facebook-forward-start: $*" >&2; }

PATH_NAME="${MTX_PATH:-${1:-}}"
if [[ -z "$PATH_NAME" ]]; then
  log "empty path — exit"
  exit 0
fi

log "begin path=${PATH_NAME}"

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${FB_FORWARD_PID_DIR:-/tmp/eventlive-fb-forward}"
mkdir -p "$PID_DIR"
PID_FILE="${PID_DIR}/${SAFE_NAME}.pid"
LOG_FILE="${PID_DIR}/${SAFE_NAME}.log"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    log "stopping previous pid=${OLD_PID}"
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.5
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

API_BASE="${EVENTLIVE_API_BASE:-http://127.0.0.1:5000}"
SECRET_FILE="${EVENTLIVE_ENV_FILE:-/root/EventLive-Pro/server/.env}"
MEDIA_SECRET=""
if [[ -f "$SECRET_FILE" ]]; then
  MEDIA_SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$SECRET_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi
if [[ -z "$MEDIA_SECRET" ]]; then
  log "FAILED reason=MEDIA_SERVER_SECRET_missing"
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  log "FAILED reason=ffmpeg_not_installed"
  exit 0
fi

RAW="$(curl -sS -m 10 -G "${API_BASE}/api/events/stream/facebook-forward" \
  --data-urlencode "path=${PATH_NAME}" \
  -H "x-media-secret: ${MEDIA_SECRET}" \
  -w "\n%{http_code}" \
  || true)"
HTTP_CODE="$(echo "$RAW" | tail -n1)"
RESP="$(echo "$RAW" | sed '$d')"
log "api http=${HTTP_CODE} body=${RESP}"

ENABLED="$(RESP="$RESP" python3 - <<'PY'
import json, os
try:
  data = json.loads(os.environ.get("RESP") or "{}")
except Exception:
  data = {}
print("1" if data.get("enabled") and data.get("target") else "0")
print(data.get("target") or "")
print(data.get("reason") or "")
PY
)"

ENABLED_FLAG="$(echo "$ENABLED" | sed -n '1p')"
TARGET="$(echo "$ENABLED" | sed -n '2p')"
REASON="$(echo "$ENABLED" | sed -n '3p')"

if [[ "$ENABLED_FLAG" != "1" || -z "$TARGET" ]]; then
  log "destination=facebook enabled=false reason=${REASON:-unknown}"
  exit 0
fi

log "destination=facebook enabled=true"
SOURCE="rtmp://127.0.0.1:1935/${PATH_NAME}"
sleep 2

log "Forward started ffmpeg ${SOURCE} -> Facebook (key redacted) log=${LOG_FILE}"
nohup ffmpeg -hide_banner -loglevel error \
  -rw_timeout 15000000 \
  -i "$SOURCE" \
  -c copy -f flv \
  "$TARGET" \
  >>"$LOG_FILE" 2>&1 &
FFPID=$!
echo "$FFPID" >"$PID_FILE"
log "ffmpeg_pid=${FFPID}"

sleep 2
if kill -0 "$FFPID" 2>/dev/null; then
  log "Forward success ffmpeg_pid=${FFPID} still_running=true"
else
  wait "$FFPID" 2>/dev/null || true
  CODE=$?
  ERR="$(tail -c 2000 "$LOG_FILE" 2>/dev/null | tr -d '\r' || true)"
  log "FAILED reason=ffmpeg_exited_early exit_code=${CODE} error_output=${ERR}"
  rm -f "$PID_FILE"
fi

exit 0
