#!/bin/bash
# Transcodes one RTMP source into adaptive HLS (240p/360p/480p/720p) with a
# master playlist. Every rendition is bitrate-capped; 720p never exceeds
# 1000 kbps, protecting the server regardless of the incoming bitrate.
set -uo pipefail

KEY="$1"
SHORT="$2"
OUT="/hls/$SHORT"

mkdir -p "$OUT/0" "$OUT/1" "$OUT/2" "$OUT/3"

# Ladder: name | scale | video kbps (<=1000) | audio kbps
#   240p 426x240 300k | 360p 640x360 500k | 480p 854x480 800k | 720p 1280x720 1000k
exec ffmpeg -nostdin -loglevel warning -i "rtmp://127.0.0.1:1935/$KEY" \
  -filter_complex "\
[0:v]split=4[v0][v1][v2][v3];\
[v0]scale=w=426:h=240:force_original_aspect_ratio=decrease,pad=426:240:(ow-iw)/2:(oh-ih)/2[v0o];\
[v1]scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2[v1o];\
[v2]scale=w=854:h=480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2[v2o];\
[v3]scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v3o]" \
  -map "[v0o]" -c:v:0 libx264 -b:v:0 300k  -maxrate:v:0 300k  -bufsize:v:0 600k \
  -map "[v1o]" -c:v:1 libx264 -b:v:1 500k  -maxrate:v:1 500k  -bufsize:v:1 1000k \
  -map "[v2o]" -c:v:2 libx264 -b:v:2 800k  -maxrate:v:2 800k  -bufsize:v:2 1600k \
  -map "[v3o]" -c:v:3 libx264 -b:v:3 1000k -maxrate:v:3 1000k -bufsize:v:3 2000k \
  -map a:0 -map a:0 -map a:0 -map a:0 \
  -c:a aac -b:a 96k -ac 2 \
  -preset veryfast -profile:v main -sc_threshold 0 -g 48 -keyint_min 48 \
  -f hls -hls_time 4 -hls_list_size 6 \
  -hls_flags delete_segments+independent_segments \
  -hls_segment_type mpegts \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "$OUT/%v/seg_%03d.ts" \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3" \
  "$OUT/%v/index.m3u8"
