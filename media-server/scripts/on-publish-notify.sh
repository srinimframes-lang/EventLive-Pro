#!/usr/bin/env bash
# VPS native MediaMTX hook — notify backend when OBS starts publishing.
# Does NOT start ffmpeg/transcode (unlike docker on_publish.sh).
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
[[ -z "$PATH_NAME" ]] && exit 0

API_BASE="${EVENTLIVE_API_BASE:-http://127.0.0.1:5000}"
SECRET_FILE="/root/EventLive-Pro/server/.env"
MEDIA_SECRET=""
if [[ -f "$SECRET_FILE" ]]; then
  MEDIA_SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$SECRET_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi

PAYLOAD="$(PATH_NAME="$PATH_NAME" python3 - <<'PY'
import json, os
print(json.dumps({"path": os.environ.get("PATH_NAME", ""), "streamKey": os.environ.get("PATH_NAME", "")}))
PY
)"

if [[ -n "$MEDIA_SECRET" ]]; then
  curl -sS -m 8 -X POST "${API_BASE}/api/events/stream/started" \
    -H 'Content-Type: application/json' \
    -H "x-media-secret: ${MEDIA_SECRET}" \
    -d "$PAYLOAD" \
    || echo "on-publish-notify: warning — stream/started failed for ${PATH_NAME}" >&2
fi

# Multi-destination RTMP forward (YouTube + Facebook). No-op unless enabled.
# Invoke with bash: repo file mode is often 100644 after git pull.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MULTI_START="${SCRIPT_DIR}/rtmp-forward-start.sh"
if [[ -f "$MULTI_START" ]]; then
  echo "on-publish-notify: starting rtmp forwards for ${PATH_NAME}" >&2
  bash "$MULTI_START" "$PATH_NAME" \
    || echo "on-publish-notify: warning — rtmp forward start failed for ${PATH_NAME}" >&2
else
  # Legacy fallbacks (single-platform scripts).
  YT_START="${SCRIPT_DIR}/youtube-forward-start.sh"
  if [[ -f "$YT_START" ]]; then
    bash "$YT_START" "$PATH_NAME" \
      || echo "on-publish-notify: warning — youtube forward start failed for ${PATH_NAME}" >&2
  fi
  FB_START="${SCRIPT_DIR}/facebook-forward-start.sh"
  if [[ -f "$FB_START" ]]; then
    bash "$FB_START" "$PATH_NAME" \
      || echo "on-publish-notify: warning — facebook forward start failed for ${PATH_NAME}" >&2
  fi
fi

# 2-quality Adaptive HLS (live only). No-op unless Super Admin enabled Adaptive for the event.
ABR_START="${SCRIPT_DIR}/abr-transcode-start.sh"
if [[ -f "$ABR_START" ]]; then
  echo "on-publish-notify: starting ABR transcoder for ${PATH_NAME}" >&2
  bash "$ABR_START" "$PATH_NAME" \
    || echo "on-publish-notify: warning — ABR start failed for ${PATH_NAME}" >&2
fi

exit 0
