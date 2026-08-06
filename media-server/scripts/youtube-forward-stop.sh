#!/usr/bin/env bash
# Stop YouTube RTMP forwarder for a MediaMTX path (runOnNotReady).
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
[[ -z "$PATH_NAME" ]] && exit 0

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${YT_FORWARD_PID_DIR:-/tmp/eventlive-yt-forward}"
PID_FILE="${PID_DIR}/${SAFE_NAME}.pid"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.5
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

exit 0
