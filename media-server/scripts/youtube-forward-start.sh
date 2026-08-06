#!/usr/bin/env bash
# Start ffmpeg RTMP forward to YouTube when Server + YouTube is enabled.
# Called from on-publish-notify.sh (MediaMTX runOnReady). Does not affect
# HLS playback, recording, or Server Only / YouTube Only events.
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
[[ -z "$PATH_NAME" ]] && exit 0

# MediaMTX paths look like "live/<eventId>" — flatten for pid files.
SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${YT_FORWARD_PID_DIR:-/tmp/eventlive-yt-forward}"
mkdir -p "$PID_DIR"
PID_FILE="${PID_DIR}/${SAFE_NAME}.pid"
LOG_FILE="${PID_DIR}/${SAFE_NAME}.log"

# Stop any previous forwarder for this path.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
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
[[ -z "$MEDIA_SECRET" ]] && exit 0

RESP="$(curl -sS -m 8 -G "${API_BASE}/api/events/stream/youtube-forward" \
  --data-urlencode "path=${PATH_NAME}" \
  -H "x-media-secret: ${MEDIA_SECRET}" \
  || true)"

ENABLED="$(RESP="$RESP" python3 - <<'PY'
import json, os
try:
  data = json.loads(os.environ.get("RESP") or "{}")
except Exception:
  data = {}
print("1" if data.get("enabled") and data.get("target") else "0")
print(data.get("target") or "")
PY
)"

ENABLED_FLAG="$(echo "$ENABLED" | sed -n '1p')"
TARGET="$(echo "$ENABLED" | sed -n '2p')"

[[ "$ENABLED_FLAG" == "1" && -n "$TARGET" ]] || exit 0

# Local MediaMTX RTMP read (auth excludes "read").
SOURCE="rtmp://127.0.0.1:1935/${PATH_NAME}"

# Brief wait so the publisher is fully ready.
sleep 2

nohup ffmpeg -hide_banner -loglevel error \
  -rw_timeout 15000000 \
  -i "$SOURCE" \
  -c copy -f flv \
  "$TARGET" \
  >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

exit 0
