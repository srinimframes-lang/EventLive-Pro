#!/usr/bin/env bash
# Install Nginx reverse proxy for MediaMTX HLS on the Hostinger VPS.
# Run as root on the VPS (Hostinger browser terminal if SSH is blocked).
# Does NOT modify MediaMTX.
set -euo pipefail

DOMAIN="stream.eventlivepro.com"
EMAIL="admin@eventlivepro.com"
CONF_SRC="$(cd "$(dirname "$0")" && pwd)/stream.eventlivepro.com.conf"
CONF_DST="/etc/nginx/sites-available/${DOMAIN}"

if [[ ! -f "$CONF_SRC" ]]; then
  echo "Missing config: $CONF_SRC"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

# Ensure MediaMTX HLS is local
if ! ss -tlnp | grep -q ':8888'; then
  echo "WARNING: nothing listening on :8888 — start MediaMTX before testing playback."
fi

cp "$CONF_SRC" "$CONF_DST"
ln -sfn "$CONF_DST" "/etc/nginx/sites-enabled/${DOMAIN}"
# Avoid default site fighting for :80 if present
rm -f /etc/nginx/sites-enabled/default || true

nginx -t
systemctl enable nginx
systemctl reload nginx

# Open firewall if ufw is active
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || {
  echo "Certbot failed — check DNS A record for $DOMAIN and that ports 80/443 are open in Hostinger firewall."
  exit 1
}

nginx -t
systemctl reload nginx

echo "---- verify ----"
curl -sI "https://${DOMAIN}/live/test/index.m3u8" | head -n 20 || true
echo "Done. Playback URL: https://${DOMAIN}/live/<streamKey>/index.m3u8"
