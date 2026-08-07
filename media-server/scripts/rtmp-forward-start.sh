#!/usr/bin/env bash
# Multi-destination RTMP forward starter (YouTube + Facebook).
# Called from on-publish-notify.sh. Falls back to per-destination APIs when
# /stream/forwards returns nothing (older backends / partial deploys).
set -euo pipefail

log() { echo "rtmp-forward-start: $*" >&2; }

PATH_NAME="${MTX_PATH:-${1:-}}"
if [[ -z "$PATH_NAME" ]]; then
  log "empty path — exit"
  exit 0
fi

log "publish forward begin path=${PATH_NAME}"

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${RTMP_FORWARD_PID_DIR:-/tmp/eventlive-rtmp-forward}"
mkdir -p "$PID_DIR"
MASTER_LOG="${PID_DIR}/${SAFE_NAME}.master.log"

API_BASE="${EVENTLIVE_API_BASE:-http://127.0.0.1:5000}"
SECRET_FILE="${EVENTLIVE_ENV_FILE:-/root/EventLive-Pro/server/.env}"
MEDIA_SECRET=""
if [[ -f "$SECRET_FILE" ]]; then
  MEDIA_SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$SECRET_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi
if [[ -z "$MEDIA_SECRET" ]]; then
  log "FAILED reason=MEDIA_SERVER_SECRET_missing env_file=${SECRET_FILE}"
  exit 0
fi
log "media secret loaded (length=${#MEDIA_SECRET})"

if ! command -v ffmpeg >/dev/null 2>&1; then
  log "FAILED reason=ffmpeg_not_installed"
  exit 0
fi
log "ffmpeg ok: $(command -v ffmpeg)"

fetch_json() {
  local url="$1"
  curl -sS -m 10 -G "$url" \
    --data-urlencode "path=${PATH_NAME}" \
    -H "x-media-secret: ${MEDIA_SECRET}" \
    -w "\n%{http_code}" \
    || true
}

# Stop existing forwarders for this path (all platforms).
shopt -s nullglob
for OLD in "$PID_DIR"/"${SAFE_NAME}".*.pid; do
  OLD_PID="$(cat "$OLD" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    log "stopping previous forwarder pid=${OLD_PID} file=${OLD}"
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.3
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$OLD"
done
shopt -u nullglob

SOURCE="rtmp://127.0.0.1:1935/${PATH_NAME}"
log "local source=${SOURCE}"

RAW="$(fetch_json "${API_BASE}/api/events/stream/forwards")"
HTTP_CODE="$(echo "$RAW" | tail -n1)"
RESP="$(echo "$RAW" | sed '$d')"
log "forwards API http=${HTTP_CODE} body=${RESP}"

# Build targets JSON via python (multi API + per-destination fallback).
TARGETS_JSON="$(
PATH_NAME="$PATH_NAME" API_BASE="$API_BASE" MEDIA_SECRET="$MEDIA_SECRET" RESP="$RESP" HTTP_CODE="$HTTP_CODE" python3 - <<'PY'
import json, os, urllib.parse, urllib.request

path = os.environ.get("PATH_NAME", "")
api = os.environ.get("API_BASE", "").rstrip("/")
secret = os.environ.get("MEDIA_SECRET", "")
resp = os.environ.get("RESP") or ""
http_code = os.environ.get("HTTP_CODE") or ""

def load(raw):
    try:
        return json.loads(raw or "{}")
    except Exception:
        return {}

def get(endpoint):
    url = f"{api}{endpoint}?{urllib.parse.urlencode({'path': path})}"
    req = urllib.request.Request(url, headers={"x-media-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, load(body)
    except Exception as e:
        return 0, {"ok": False, "enabled": False, "reason": f"http_error:{e}"}

data = load(resp)
targets = list(data.get("targets") or [])
diag = data.get("diagnostics") or {}

if not targets:
    # Fallback: youtube-forward + facebook-forward (works even if /forwards missing).
    yt_code, yt = get("/api/events/stream/youtube-forward")
    fb_code, fb = get("/api/events/stream/facebook-forward")
    print(f"rtmp-forward-start: fallback youtube http={yt_code} enabled={yt.get('enabled')} reason={yt.get('reason')}", flush=True)
    print(f"rtmp-forward-start: fallback facebook http={fb_code} enabled={fb.get('enabled')} reason={fb.get('reason')}", flush=True)
    if yt.get("enabled") and yt.get("target"):
        targets.append({
            "id": "youtube",
            "platform": "youtube",
            "target": yt["target"],
            "rtmpUrl": yt.get("rtmpUrl") or "",
        })
    if fb.get("enabled") and fb.get("target"):
        targets.append({
            "id": "facebook",
            "platform": "facebook",
            "target": fb["target"],
            "rtmpUrl": fb.get("rtmpUrl") or "",
        })
    if not diag:
        diag = {
            "fallback": True,
            "forwardsHttp": http_code,
            "youtubeReason": yt.get("reason"),
            "facebookReason": fb.get("reason"),
        }

out = {
    "enabled": len(targets) > 0,
    "targets": targets,
    "reason": data.get("reason") or diag.get("youtubeSkipReason") or diag.get("facebookSkipReason") or ("ok" if targets else "no_targets"),
    "diagnostics": diag,
}
print(json.dumps(out))
PY
)"

# Separate stderr lines printed by python fallback from final JSON.
TARGETS_LINE="$(echo "$TARGETS_JSON" | tail -n1)"
echo "$TARGETS_JSON" | sed '$d' >&2 || true
log "resolved targets json=${TARGETS_LINE}"

SOURCE="$SOURCE" SAFE_NAME="$SAFE_NAME" PID_DIR="$PID_DIR" PATH_NAME="$PATH_NAME" TARGETS_LINE="$TARGETS_LINE" python3 - <<'PY'
import json, os, subprocess, time, sys

path_name = os.environ["PATH_NAME"]
safe = os.environ["SAFE_NAME"]
pid_dir = os.environ["PID_DIR"]
source = os.environ["SOURCE"]
raw = os.environ.get("TARGETS_LINE") or "{}"

def log(msg):
    print(f"rtmp-forward-start: {msg}", file=sys.stderr, flush=True)

try:
    data = json.loads(raw)
except Exception as e:
    log(f"FAILED reason=targets_json_parse error={e} raw={raw[:300]}")
    sys.exit(0)

targets = data.get("targets") or []
reason = data.get("reason") or "none"
diag = data.get("diagnostics") or {}
log(f"destination check enabled={bool(data.get('enabled'))} count={len(targets)} reason={reason} diagnostics={json.dumps(diag)}")

if not targets:
    log(f"FAILED reason=no_enabled_destinations detail={reason}")
    sys.exit(0)

# Brief wait so MediaMTX publisher is fully ready.
time.sleep(2)

started = 0
for t in targets:
    tid = str(t.get("id") or t.get("platform") or "dest").replace("/", "_")
    target = t.get("target") or ""
    if not target:
        log(f"destination={tid} SKIP reason=empty_target")
        continue
    log(f"destination={tid} enabled=true rtmpUrl={t.get('rtmpUrl') or '(default)'} target=(redacted)")
    pid_file = os.path.join(pid_dir, f"{safe}.{tid}.pid")
    log_file = os.path.join(pid_dir, f"{safe}.{tid}.log")
    with open(log_file, "a", encoding="utf-8") as lf:
        lf.write(f"\n--- forward start {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} path={path_name} dest={tid} ---\n")
    try:
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
    except Exception as e:
        log(f"destination={tid} FAILED reason=ffmpeg_spawn error={e}")
        continue

    with open(pid_file, "w", encoding="utf-8") as f:
        f.write(str(proc.pid))
    log(f"destination={tid} Forward started ffmpeg_pid={proc.pid} log={log_file}")

    time.sleep(2)
    code = proc.poll()
    if code is not None:
        err = ""
        try:
            with open(log_file, "r", encoding="utf-8", errors="replace") as lf:
                err = lf.read()[-2000:]
        except Exception:
            pass
        # Never print full RTMP URLs with keys.
        err = err.replace(target, "(redacted_target)")
        log(f"destination={tid} FAILED reason=ffmpeg_exited_early exit_code={code} error_output={err!r}")
        try:
            os.remove(pid_file)
        except Exception:
            pass
        continue

    log(f"destination={tid} Forward success ffmpeg_pid={proc.pid} still_running=true")
    started += 1

if started == 0:
    log("FAILED reason=all_destinations_failed_to_start")
else:
    log(f"done started={started}/{len(targets)} for path={path_name}")
PY

log "publish forward end path=${PATH_NAME}"
exit 0
