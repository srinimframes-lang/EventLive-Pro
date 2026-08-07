#!/usr/bin/env bash
# VPS native MediaMTX hook — notify backend when OBS starts publishing.
# Does NOT start ffmpeg/transcode (unlike docker on_publish.sh).
set -euo pipefail

log() { echo "on-publish-notify: $*" >&2; }

PATH_NAME="${MTX_PATH:-${1:-}}"
if [[ -z "$PATH_NAME" ]]; then
  log "empty path — exit"
  exit 0
fi

log "Publish detected path=${PATH_NAME}"

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
  log "calling stream/started"
  if curl -sS -m 8 -X POST "${API_BASE}/api/events/stream/started" \
    -H 'Content-Type: application/json' \
    -H "x-media-secret: ${MEDIA_SECRET}" \
    -d "$PAYLOAD"; then
    log "stream/started ok"
  else
    log "WARNING stream/started failed for ${PATH_NAME}"
  fi
  echo >&2
else
  log "WARNING MEDIA_SERVER_SECRET missing — skip stream/started"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# YouTube + Facebook forwards (single entrypoint — avoids double ffmpeg).
# rtmp-forward-start falls back to /youtube-forward + /facebook-forward APIs.
MULTI_START="${SCRIPT_DIR}/rtmp-forward-start.sh"
if [[ -f "$MULTI_START" ]]; then
  log "starting destination forwards (YouTube/Facebook as enabled)"
  bash "$MULTI_START" "$PATH_NAME" \
    || log "WARNING rtmp-forward-start failed for ${PATH_NAME}"
else
  log "rtmp-forward-start.sh missing — legacy per-destination scripts"
  YT_START="${SCRIPT_DIR}/youtube-forward-start.sh"
  if [[ -f "$YT_START" ]]; then
    log "starting youtube forward"
    bash "$YT_START" "$PATH_NAME" \
      || log "WARNING youtube-forward-start failed for ${PATH_NAME}"
  fi
  FB_START="${SCRIPT_DIR}/facebook-forward-start.sh"
  if [[ -f "$FB_START" ]]; then
    log "starting facebook forward"
    bash "$FB_START" "$PATH_NAME" \
      || log "WARNING facebook-forward-start failed for ${PATH_NAME}"
  fi
fi

# 2-quality Adaptive HLS (live only). No-op unless Super Admin enabled Adaptive.
ABR_START="${SCRIPT_DIR}/abr-transcode-start.sh"
if [[ -f "$ABR_START" ]]; then
  log "starting ABR transcoder (no-op if Standard mode)"
  bash "$ABR_START" "$PATH_NAME" \
    || log "WARNING ABR start failed for ${PATH_NAME}"
fi

log "publish hook complete path=${PATH_NAME}"
exit 0
