#!/bin/bash
# Runs when a broadcaster stops publishing. Notifies the backend (stream goes
# offline) and stops any background recording for this key.
set -uo pipefail

KEY="${MTX_PATH:-${1:-}}"
[ -z "$KEY" ] && exit 0

curl -s -m 5 -X POST "$BACKEND_URL/api/events/stream/stopped" \
  -H 'Content-Type: application/json' \
  -H "x-media-secret: $MEDIA_SERVER_SECRET" \
  -d "{\"streamKey\":\"$KEY\"}" >/dev/null || true

if [ -f "/tmp/rec-$KEY.pid" ]; then
  kill "$(cat "/tmp/rec-$KEY.pid")" 2>/dev/null || true
  rm -f "/tmp/rec-$KEY.pid"
fi

exit 0
