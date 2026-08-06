#!/usr/bin/env bash
# Multi-destination RTMP forward starter (YouTube + Facebook + future).
# Prefer this from on-publish when available; falls back to per-platform scripts.
# Calls GET /api/events/stream/forwards with MEDIA_SERVER_SECRET.
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
if [[ -z "$PATH_NAME" ]]; then
  echo "rtmp-forward-start: empty path — exit" >&2
  exit 0
fi

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${RTMP_FORWARD_PID_DIR:-/tmp/eventlive-rtmp-forward}"
mkdir -p "$PID_DIR"

API_BASE="${EVENTLIVE_API_BASE:-http://127.0.0.1:5000}"
SECRET_FILE="${EVENTLIVE_ENV_FILE:-/root/EventLive-Pro/server/.env}"
MEDIA_SECRET=""
if [[ -f "$SECRET_FILE" ]]; then
  MEDIA_SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$SECRET_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi
if [[ -z "$MEDIA_SECRET" ]]; then
  echo "rtmp-forward-start: MEDIA_SERVER_SECRET missing — exit" >&2
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "rtmp-forward-start: ffmpeg not installed — exit" >&2
  exit 0
fi

RESP="$(curl -sS -m 8 -G "${API_BASE}/api/events/stream/forwards" \
  --data-urlencode "path=${PATH_NAME}" \
  -H "x-media-secret: ${MEDIA_SECRET}" \
  || true)"

echo "rtmp-forward-start: api response for ${PATH_NAME}: ${RESP}" >&2

# Stop existing forwarders for this path (all platforms).
for OLD in "$PID_DIR"/"${SAFE_NAME}".*.pid; do
  [[ -f "$OLD" ]] || continue
  OLD_PID="$(cat "$OLD" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.3
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$OLD"
done

SOURCE="rtmp://127.0.0.1:1935/${PATH_NAME}"
sleep 2

# Parse targets JSON array → start one ffmpeg per destination.
python3 - "$PATH_NAME" "$SAFE_NAME" "$PID_DIR" "$SOURCE" "$RESP" <<'PY'
import json, os, subprocess, sys

path_name, safe, pid_dir, source, resp = sys.argv[1:6]
try:
    data = json.loads(resp or "{}")
except Exception:
    data = {}
targets = data.get("targets") or []
if not data.get("enabled") or not targets:
    print(f"rtmp-forward-start: no targets for {path_name} reason={data.get('reason') or 'none'}", file=sys.stderr)
    sys.exit(0)

for t in targets:
    tid = str(t.get("id") or t.get("platform") or "dest").replace("/", "_")
    target = t.get("target") or ""
    if not target:
        continue
    pid_file = os.path.join(pid_dir, f"{safe}.{tid}.pid")
    log_file = os.path.join(pid_dir, f"{safe}.{tid}.log")
    print(f"rtmp-forward-start: ffmpeg {source} -> {tid} (key redacted) log={log_file}", file=sys.stderr)
    proc = subprocess.Popen(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-rw_timeout", "15000000",
            "-i", source,
            "-c", "copy", "-f", "flv",
            target,
        ],
        stdout=open(log_file, "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    with open(pid_file, "w") as f:
        f.write(str(proc.pid))
    print(f"rtmp-forward-start: started {tid} pid={proc.pid} for {path_name}", file=sys.stderr)
PY

exit 0
