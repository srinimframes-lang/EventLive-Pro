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

has_video() {
  local f="$1"
  command -v ffprobe >/dev/null 2>&1 || return 0
  local codec
  codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$f" 2>/dev/null || true)"
  [[ -n "$codec" ]]
}

if command -v ffmpeg >/dev/null 2>&1; then
  if ffmpeg -y -loglevel error -i "$SEGMENT" -map 0 -c copy -movflags +faststart "$TMP" && has_video "$TMP"; then
    mv -f "$TMP" "$OUT"
    rm -f "$SEGMENT"
  else
    rm -f "$TMP"
    mv -f "$SEGMENT" "$OUT"
  fi
else
  mv -f "$SEGMENT" "$OUT"
fi

# Quarantine audio-only / empty OBS connect blips. Do not register them —
# ffmpeg concat demuxer would copy their stream layout and drop later video.
if command -v ffprobe >/dev/null 2>&1 && ! has_video "$OUT"; then
  REJECT_DIR="${DEST_DIR}/.rejected"
  mkdir -p "$REJECT_DIR"
  mv -f "$OUT" "${REJECT_DIR}/${BASE}"
  echo "finalize-recording: quarantined no-video blip ${REJECT_DIR}/${BASE}" >&2
  PARENT="$(dirname "$SEGMENT")"
  rmdir -p --ignore-fail-on-non-empty "$PARENT" 2>/dev/null || true
  exit 0
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
DURATION_SEC="$(DURATION_RAW="$DURATION_RAW" OUT="$OUT" python3 - <<'PY'
import os, re, subprocess

def parse_go_duration(s):
    s = (s or '').strip()
    if re.match(r'^-?\d+(\.\d+)?$', s):
        return int(round(float(s)))
    total = 0.0
    matched = False
    for n, unit in re.findall(r'(-?\d+(?:\.\d+)?)(ns|us|µs|ms|h|m|s)', s):
        matched = True
        x = float(n)
        total += {
            'h': 3600.0, 'm': 60.0, 's': 1.0, 'ms': 0.001,
            'us': 1e-6, 'µs': 1e-6, 'ns': 1e-9,
        }.get(unit, 0.0) * x
    return int(round(total)) if matched else 0

raw = os.environ.get('DURATION_RAW', '0')
sec = parse_go_duration(raw)
out = os.environ.get('OUT', '')
probe = 0
if out:
    try:
        p = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', out],
            capture_output=True, text=True, timeout=60,
        )
        probe = int(round(float((p.stdout or '0').strip() or 0)))
    except Exception:
        probe = 0
# Prefer parsed MTX duration when it is not the 24h segment ceiling.
ceiling = 24 * 3600
if sec > 0 and abs(sec - ceiling) > 90 * 60:
    print(sec)
elif probe > 0 and abs(probe - ceiling) > 90 * 60:
    print(probe)
elif sec > 0:
    print(sec)
elif probe > 0:
    print(probe)
else:
    print(0)
PY
)"

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
