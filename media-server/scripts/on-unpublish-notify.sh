#!/usr/bin/env bash
# VPS native MediaMTX hook — notify backend when OBS stops publishing.
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
  curl -sS -m 8 -X POST "${API_BASE}/api/events/stream/stopped" \
    -H 'Content-Type: application/json' \
    -H "x-media-secret: ${MEDIA_SECRET}" \
    -d "$PAYLOAD" \
    || echo "on-unpublish-notify: warning — stream/stopped failed for ${PATH_NAME}" >&2
fi

exit 0
