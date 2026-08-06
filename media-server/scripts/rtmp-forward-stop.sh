#!/usr/bin/env bash
# Stop all multi-destination RTMP forwarders for a MediaMTX path.
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
[[ -z "$PATH_NAME" ]] && exit 0

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${RTMP_FORWARD_PID_DIR:-/tmp/eventlive-rtmp-forward}"

shopt -s nullglob
for PID_FILE in "$PID_DIR"/"${SAFE_NAME}".*.pid; do
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.3
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
done

# Also stop legacy per-platform pid dirs (youtube / facebook scripts).
for LEGACY_DIR in \
  "${YT_FORWARD_PID_DIR:-/tmp/eventlive-yt-forward}" \
  "${FB_FORWARD_PID_DIR:-/tmp/eventlive-fb-forward}"; do
  LEGACY="${LEGACY_DIR}/${SAFE_NAME}.pid"
  if [[ -f "$LEGACY" ]]; then
    OLD_PID="$(cat "$LEGACY" 2>/dev/null || true)"
    if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      kill "$OLD_PID" 2>/dev/null || true
      sleep 0.3
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$LEGACY"
  fi
done

exit 0
