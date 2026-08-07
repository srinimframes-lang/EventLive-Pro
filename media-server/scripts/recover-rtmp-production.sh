#!/usr/bin/env bash
# EventLive Pro — RTMP / MediaMTX production recovery
# Run as root in Hostinger VPS browser terminal (SSH may be blocked).
# Restores OBS ingest on :1935 without changing app code.
set -euo pipefail

echo "======== EventLive RTMP recovery ========"
echo "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo ""
echo "--- 1) PM2 ---"
command -v pm2 >/dev/null && pm2 list || echo "pm2 missing"

echo ""
echo "--- 2) Listeners (1935/9997/8888/5000) ---"
ss -tulnp | grep -E ':1935|:9997|:8888|:5000|:80|:443' || echo "NO matching listeners"

echo ""
echo "--- 3) Firewall ---"
if command -v ufw >/dev/null; then
  ufw status verbose || true
  ufw allow 1935/tcp comment 'EventLive MediaMTX RTMP' || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 22/tcp || true
  ufw --force enable || true
  ufw status verbose || true
else
  echo "ufw not installed"
fi
# Hostinger may also use iptables / panel firewall — open 1935 there if still blocked.
iptables -C INPUT -p tcp --dport 1935 -j ACCEPT 2>/dev/null \
  || iptables -I INPUT -p tcp --dport 1935 -j ACCEPT || true

echo ""
echo "--- 4) nginx ---"
systemctl is-active nginx || true
systemctl status nginx --no-pager -l | head -n 30 || true
# nginx does NOT terminate RTMP; only confirm it is not binding :1935
ss -tulnp | grep ':1935' || echo "1935 still free for MediaMTX (good if down)"

echo ""
echo "--- 5) DNS ---"
getent hosts stream.eventlivepro.com || true
command -v dig >/dev/null && dig +short stream.eventlivepro.com A || true
command -v nslookup >/dev/null && nslookup stream.eventlivepro.com || true
hostname -I || true

echo ""
echo "--- 6) MediaMTX config ---"
REPO="${REPO:-/root/EventLive-Pro}"
CFG_SRC="${REPO}/media-server/mediamtx/mediamtx-vps-native.yml"
CFG_DST="/opt/mediamtx.yml"
ENV_FILE="${REPO}/server/.env"

if [[ -f "$CFG_SRC" ]]; then
  echo "repo config present: $CFG_SRC"
  # Ensure RTMP is enabled on :1935 in the deployed copy.
  if [[ -f "$CFG_DST" ]]; then
    echo "current /opt/mediamtx.yml rtmp lines:"
    grep -nE '^(rtmp|rtmpAddress|authMethod|runOnReady)' "$CFG_DST" || true
  fi
  # Restore known-good RTMP stanza from repo (preserve secret token from env).
  SECRET=""
  if [[ -f "$ENV_FILE" ]]; then
    SECRET="$(grep -E '^MEDIA_SERVER_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
  fi
  cp -a "$CFG_DST" "/opt/mediamtx.yml.bak.$(date +%s)" 2>/dev/null || true
  cp -a "$CFG_SRC" "$CFG_DST"
  if [[ -n "$SECRET" ]]; then
    sed -i "s|token=MEDIA_SERVER_SECRET|token=${SECRET}|g" "$CFG_DST"
    echo "injected MEDIA_SERVER_SECRET into authHTTPAddress"
  else
    echo "WARNING: MEDIA_SERVER_SECRET missing — auth may reject OBS publish"
  fi
  echo "deployed config rtmp lines:"
  grep -nE '^(rtmp|rtmpAddress|authMethod|runOnReady)' "$CFG_DST" || true
else
  echo "FAIL: missing $CFG_SRC — clone/pull EventLive-Pro first"
fi

echo ""
echo "--- 7) Restart MediaMTX via PM2 ---"
if command -v pm2 >/dev/null; then
  pm2 restart mediamtx || pm2 start mediamtx || true
  sleep 2
  pm2 list
  pm2 logs mediamtx --lines 80 --nostream || true
else
  echo "pm2 missing — start mediamtx binary manually if installed"
fi

echo ""
echo "--- 8) MediaMTX API ---"
curl -sS -m 5 http://127.0.0.1:9997/v3/config/global/get | head -c 800 || echo "API unreachable"
echo
curl -sS -m 5 http://127.0.0.1:9997/v3/paths/list | head -c 400 || true
echo

echo ""
echo "--- 9) Re-check :1935 ---"
ss -tulnp | grep ':1935' || echo "FAIL: still not listening on 1935"
if ss -tulnp | grep -q ':1935'; then
  echo "OK: MediaMTX listening on 1935"
fi

echo ""
echo "--- 10) Backend ---"
curl -sS -m 5 http://127.0.0.1:5000/health || echo "backend health fail"
echo
pm2 list || true

echo ""
echo "======== Done ========"
echo "If OBS still times out after :1935 listens locally:"
echo "  1) Hostinger hPanel → Firewall → allow TCP 1935 inbound"
echo "  2) Confirm VPS public IP is still 200.97.166.42"
echo "  3) OBS Server = rtmp://stream.eventlivepro.com:1935/live"
echo "     OBS Stream Key = <eventId> only (not full URL)"
