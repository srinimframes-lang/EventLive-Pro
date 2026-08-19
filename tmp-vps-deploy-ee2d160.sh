#!/usr/bin/env bash
# Run on Hostinger VPS browser terminal (or: ssh root@200.97.166.42)
# Deploys backend commit ee2d160 and restarts PM2.
set -euo pipefail
cd /root/EventLive-Pro
git fetch origin main
git checkout main
git pull origin main
echo "HEAD=$(git rev-parse HEAD)"
git log -1 --oneline
test "$(git rev-parse HEAD)" = "ee2d160dbcb214bcbc46a7127fb349a94baa30f4" \
  || { echo "FAIL: expected ee2d160"; exit 1; }
test -f server/src/utils/streamReconnect.js
test -f server/src/utils/mergeRecordings.js
# Install if package.json changed (safe)
cd /root/EventLive-Pro/server && npm install --omit=dev
pm2 restart all
sleep 2
pm2 list
# Confirm API on VPS exposes new fields
curl -sS "http://127.0.0.1:5000/api/events?limit=1" | head -c 200; echo
EID=$(curl -sS "http://127.0.0.1:5000/api/events?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or [{}])[0].get('id') or (d.get('data') or [{}])[0].get('_id') or '')")
echo "EID=$EID"
curl -sS "http://127.0.0.1:5000/api/events/${EID}/stream" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data') or {}; print('reconnecting' in d, 'recordingMergeStatus' in d, d.get('reconnecting'), d.get('recordingMergeStatus'))"
echo "VPS backend deploy OK"
