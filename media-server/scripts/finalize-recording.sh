#!/usr/bin/env bash
# Move a finished MediaMTX recording segment into recordings/<eventId>/,
# remux to standard MP4, then register the file in MongoDB via the backend.
set -euo pipefail

SEGMENT="${MTX_SEGMENT_PATH:-}"
PATH_NAME="${MTX_PATH:-}"
DURATION_RAW="${MTX_SEGMENT_DURATION:-0}"

if [[ -z "$SEGMENT" || ! -f "$SEGMENT" ]]; then
  echo "finalize-recording: missing segment ($SEGMENT)" >&2
  exit 0
fi

# Prefer a 24-char hex Mongo-style event id from the publish path.
EVENT_ID="$(printf '%s' "$PATH_NAME" | grep -oE '[a-fA-F0-9]{24}' | head -1 || true)"
if [[ -z "$EVENT_ID" ]]; then
  EVENT_ID="$(basename "$PATH_NAME")"
fi
EVENT_ID="$(printf '%s' "$EVENT_ID" | tr -cd 'A-Za-z0-9_-')"
if [[ -z "$EVENT_ID" ]]; then
  EVENT_ID="unknown"
fi

DEST_DIR="/root/EventLive-Pro/recordings/${EVENT_ID}"
mkdir -p "$DEST_DIR"

BASE="$(basename "$SEGMENT")"
TMP="${DEST_DIR}/.${BASE}.tmp.mp4"
OUT="${DEST_DIR}/${BASE}"

if command -v ffmpeg >/dev/null 2>&1; then
  if ffmpeg -y -loglevel error -i "$SEGMENT" -c copy -movflags +faststart "$TMP"; then
    mv -f "$TMP" "$OUT"
    rm -f "$SEGMENT"
  else
    rm -f "$TMP"
    mv -f "$SEGMENT" "$OUT"
  fi
else
  mv -f "$SEGMENT" "$OUT"
fi

PARENT="$(dirname "$SEGMENT")"
rmdir -p --ignore-fail-on-non-empty "$PARENT" 2>/dev/null || true

echo "finalize-recording: ${PATH_NAME} (${DURATION_RAW}s) -> ${OUT}"

# Notify backend so the event page can switch to recorded replay.
API_BASE="${EVENTLIVE_API_BASE:-http://127.0.0.1:5000}"
SECRET_FILE="/root/EventLive-Pro/server/.env"
MEDIA_SECRET=""
if [[ -f "$SECRET_FILE" ]]; then
  MEDIA_SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$SECRET_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi
DURATION_SEC="$(printf '%s' "$DURATION_RAW" | awk '{printf "%.0f", $1+0}')"

PAYLOAD="$(EVENT_ID="$EVENT_ID" PATH_NAME="$PATH_NAME" OUT="$OUT" DURATION_SEC="$DURATION_SEC" python3 - <<'PY'
import json, os
print(json.dumps({
  "eventId": os.environ["EVENT_ID"],
  "path": os.environ["PATH_NAME"],
  "filePath": os.environ["OUT"],
  "durationSec": int(os.environ.get("DURATION_SEC") or 0),
}))
PY
)"

if [[ -n "$MEDIA_SECRET" ]]; then
  curl -sS -X POST "${API_BASE}/api/events/stream/recording-ready" \
    -H "Content-Type: application/json" \
    -H "x-media-secret: ${MEDIA_SECRET}" \
    -d "$PAYLOAD" \
    || echo "finalize-recording: warning — failed to register recording with API" >&2
else
  echo "finalize-recording: warning — MEDIA_SERVER_SECRET missing; skipped API register" >&2
fi
