#!/bin/bash
# Runs when a broadcaster starts publishing to MediaMTX.
# MediaMTX provides the publish path (= stream key) in $MTX_PATH.
# Env (from compose): BACKEND_URL, MEDIA_SERVER_SECRET, PUBLIC_HLS_BASE
set -uo pipefail

KEY="${MTX_PATH:-${1:-}}"
[ -z "$KEY" ] && { echo "on_publish: missing stream key"; exit 1; }

# Resolve the public short code + recording flag from the backend.
AUTH="$(curl -s -m 5 -X POST "$BACKEND_URL/api/events/stream/auth" \
  -H 'Content-Type: application/json' \
  -H "x-media-secret: $MEDIA_SERVER_SECRET" \
  -d "{\"streamKey\":\"$KEY\"}")"

OK="$(printf '%s' "$AUTH" | jq -r '.ok // false')"
SHORT="$(printf '%s' "$AUTH" | jq -r '.shortCode // empty')"
AUTOREC="$(printf '%s' "$AUTH" | jq -r '.autoRecord // false')"

if [ "$OK" != "true" ] || [ -z "$SHORT" ]; then
  echo "on_publish: backend rejected key (ok=$OK)"; exit 1
fi

PLAYBACK="$PUBLIC_HLS_BASE/live/$SHORT/master.m3u8"

# Tell the app the stream is live (and where to play it).
curl -s -m 5 -X POST "$BACKEND_URL/api/events/stream/started" \
  -H 'Content-Type: application/json' \
  -H "x-media-secret: $MEDIA_SERVER_SECRET" \
  -d "{\"streamKey\":\"$KEY\",\"shortCode\":\"$SHORT\",\"playbackUrl\":\"$PLAYBACK\"}" >/dev/null || true

# Optional recording (raw copy) in the background; stopped on_unpublish.
if [ "$AUTOREC" = "true" ]; then
  mkdir -p "/recordings/$SHORT"
  ffmpeg -nostdin -loglevel error -i "rtmp://127.0.0.1:1935/$KEY" \
    -c copy -f mp4 "/recordings/$SHORT/$(date +%s).mp4" &
  echo $! > "/tmp/rec-$KEY.pid"
fi

# Replace this process with the transcoder so MediaMTX can stop it on unpublish.
exec bash /scripts/transcode.sh "$KEY" "$SHORT"
