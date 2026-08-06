#!/usr/bin/env bash
# 2-quality Adaptive HLS (ABR) for live only.
# OBS → MediaMTX (unchanged) → this ffmpeg → master.m3u8 (1080p + 480p).
# Recording / RTMP forwards / MediaMTX native index.m3u8 are untouched.
set -euo pipefail

PATH_NAME="${MTX_PATH:-${1:-}}"
if [[ -z "$PATH_NAME" ]]; then
  echo "abr-transcode-start: empty path — exit" >&2
  exit 0
fi

# MediaMTX path is live/<eventId>
STREAM_KEY="$(echo "$PATH_NAME" | sed -E 's#^live/##; s#/.*##')"
if [[ -z "$STREAM_KEY" ]]; then
  echo "abr-transcode-start: could not parse stream key from ${PATH_NAME}" >&2
  exit 0
fi

SAFE_NAME="$(echo "$PATH_NAME" | tr '/ ' '__')"
PID_DIR="${ABR_PID_DIR:-/tmp/eventlive-abr}"
ABR_ROOT="${ABR_HLS_ROOT:-/root/EventLive-Pro/hls-abr}"
OUT="${ABR_ROOT}/${STREAM_KEY}"
mkdir -p "$PID_DIR" "$OUT/0" "$OUT/1"
PID_FILE="${PID_DIR}/${SAFE_NAME}.pid"
LOG_FILE="${PID_DIR}/${SAFE_NAME}.log"

# Stop previous ABR for this path.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.5
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

API_BASE="${EVENTLIVE_API_BASE:-http://127.0.0.1:5000}"
SECRET_FILE="${EVENTLIVE_ENV_FILE:-/root/EventLive-Pro/server/.env}"
MEDIA_SECRET=""
if [[ -f "$SECRET_FILE" ]]; then
  MEDIA_SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$SECRET_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi
if [[ -z "$MEDIA_SECRET" ]]; then
  echo "abr-transcode-start: MEDIA_SERVER_SECRET missing — exit" >&2
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "abr-transcode-start: ffmpeg not installed — exit" >&2
  exit 0
fi

RESP="$(curl -sS -m 8 -G "${API_BASE}/api/events/stream/abr-config" \
  --data-urlencode "path=${PATH_NAME}" \
  -H "x-media-secret: ${MEDIA_SECRET}" \
  || true)"

echo "abr-transcode-start: api response for ${PATH_NAME}: ${RESP}" >&2

ENABLED="$(RESP="$RESP" python3 - <<'PY'
import json, os
try:
  data = json.loads(os.environ.get("RESP") or "{}")
except Exception:
  data = {}
print("1" if data.get("enabled") else "0")
print(data.get("reason") or "")
PY
)"

ENABLED_FLAG="$(echo "$ENABLED" | sed -n '1p')"
REASON="$(echo "$ENABLED" | sed -n '2p')"

if [[ "$ENABLED_FLAG" != "1" ]]; then
  echo "abr-transcode-start: ABR disabled for ${PATH_NAME} reason=${REASON:-unknown}" >&2
  exit 0
fi

SOURCE="rtmp://127.0.0.1:1935/${PATH_NAME}"

# Prefer hardware encode when available; otherwise libx264 veryfast.
ENCODER="libx264"
PRESET_ARGS=(-preset veryfast -profile:v main)
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'h264_nvenc'; then
  if ffmpeg -hide_banner -f lavfi -i nullsrc=s=64x64:d=0.1 -c:v h264_nvenc -f null - 2>/dev/null; then
    ENCODER="h264_nvenc"
    PRESET_ARGS=(-preset p4 -profile:v main -rc cbr)
  fi
elif ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'h264_vaapi'; then
  if [[ -e /dev/dri/renderD128 ]]; then
    ENCODER="h264_vaapi"
    PRESET_ARGS=(-vaapi_device /dev/dri/renderD128 -vf 'format=nv12,hwupload')
  fi
fi

echo "abr-transcode-start: encoder=${ENCODER} source=${SOURCE} out=${OUT}" >&2
sleep 2

# Two renditions only:
#   v0 480p  ~900 kbps video + 96k audio
#   v1 1080p ~5000 kbps video + 128k audio
# Long playlist (~60 min @ 2s) so live DVR window stays usable on ABR.
#
# Note: VAAPI filter path is more complex; fall back to libx264 if VAAPI selected
# without a full filter rewrite.
if [[ "$ENCODER" == "h264_vaapi" ]]; then
  ENCODER="libx264"
  PRESET_ARGS=(-preset veryfast -profile:v main)
  echo "abr-transcode-start: VAAPI detected but using libx264 for stable dual-ladder" >&2
fi

nohup ffmpeg -nostdin -hide_banner -loglevel error \
  -rw_timeout 15000000 \
  -i "$SOURCE" \
  -filter_complex "\
[0:v]split=2[v0][v1];\
[v0]scale=w=854:h=480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2,setsar=1[v0o];\
[v1]scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v1o]" \
  -map "[v0o]" -c:v:0 "$ENCODER" "${PRESET_ARGS[@]}" -b:v:0 900k -maxrate:v:0 1000k -bufsize:v:0 1800k \
  -map "[v1o]" -c:v:1 "$ENCODER" "${PRESET_ARGS[@]}" -b:v:1 5000k -maxrate:v:1 5500k -bufsize:v:1 10000k \
  -map a:0? -map a:0? \
  -c:a:0 aac -b:a:0 96k -ac:a:0 2 \
  -c:a:1 aac -b:a:1 128k -ac:a:1 2 \
  -sc_threshold 0 -g 48 -keyint_min 48 \
  -f hls -hls_time 2 -hls_list_size 1800 \
  -hls_flags delete_segments+independent_segments \
  -hls_segment_type mpegts \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "${OUT}/%v/seg_%05d.ts" \
  -var_stream_map "v:0,a:0 v:1,a:1" \
  "${OUT}/%v/index.m3u8" \
  >>"$LOG_FILE" 2>&1 &

echo $! >"$PID_FILE"
echo "abr-transcode-start: started pid=$(cat "$PID_FILE") for ${PATH_NAME}" >&2
exit 0
