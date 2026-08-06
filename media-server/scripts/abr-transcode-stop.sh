#!/usr/bin/env bash
# Stop Adaptive HLS (ABR) transcoder for a MediaMTX path.
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
[[ -z "$PATH_NAME" ]] && exit 0

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${ABR_PID_DIR:-/tmp/eventlive-abr}"
PID_FILE="${PID_DIR}/${SAFE_NAME}.pid"
STREAM_KEY="$(echo "$PATH_NAME" | sed -E 's#^live/##; s#/.*##')"
ABR_ROOT="${ABR_HLS_ROOT:-/root/EventLive-Pro/hls-abr}"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.5
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Best-effort cleanup of live ABR segments (recordings are separate).
if [[ -n "$STREAM_KEY" && -d "${ABR_ROOT}/${STREAM_KEY}" ]]; then
  rm -rf "${ABR_ROOT}/${STREAM_KEY}" || true
fi

exit 0
