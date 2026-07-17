# EventLive Pro — Private Media Server (RTMP → HLS / ABR)

The "Private Server Streaming" engine. It ingests RTMP, transcodes to **adaptive
HLS** with FFmpeg (240p/360p/480p/720p, hard-capped at 1000 kbps), and serves the
playlists over **automatic HTTPS**. It talks to the main EventLive backend only
over HTTP, so it does **not** touch the existing app, database, or deployment.

> ⚠️ Runs on a **dedicated VPS** (not Vercel/Render). It needs RTMP
> port `1935` and HTTP/S `80`/`443` open. On the current VPS, **Nginx**
> terminates TLS for `stream.eventlivepro.com` and MediaMTX binds HLS to
> localhost — see `nginx/README.md`.

There are two ways to run it:

| Option | What runs | When to use |
|--------|-----------|-------------|
| **A. Docker Compose (recommended)** | MediaMTX + FFmpeg + Caddy (auto-HTTPS) | One-click production deploy |
| **B. Node (alternative)** | `node-media-server` + FFmpeg (`server.js`) | Minimal/dev, you bring your own TLS |

---

## A. One-click Docker Compose (MediaMTX + Caddy)

### What you get
- **MediaMTX** RTMP ingest with OBS Server
  `rtmp://<domain>:1935/live` and a separate event stream key.
- **FFmpeg** adaptive HLS — 240p/360p/480p/720p with a master playlist.
- **Hard 1000 kbps output cap** on every rendition, whatever the customer pushes
  (500 / 800 / 1500 / 4000 / 8000 kbps all transcode down). `veryfast` preset.
- **Caddy** with automatic Let's Encrypt HTTPS, serving
  `https://<domain>/live/<shortCode>/master.m3u8` (+ CORS for hls.js).
- **Secure stream keys** — every publish is authorised against the backend
  (`/api/events/stream/mediamtx-auth`); keys are rejected once an event ends or is
  disabled.
- **Optional recording** to MP4 (enabled per event from Studio).
- **Health checks** + `restart: unless-stopped` (auto-restart / self-heal).

### Prerequisites
- A small VPS (2 vCPU / 2–4 GB RAM is plenty for a handful of capped streams),
  Ubuntu 22.04+.
- A DNS **A-record**: `stream.eventlivepro.com → <VPS public IP>`.
- Docker + Compose plugin.

### VPS deployment guide

```bash
# 1. Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh

# 2. Get the code (or copy just the media-server/ folder to the VPS)
git clone https://github.com/srinimframes-lang/EventLive-Pro.git
cd EventLive-Pro/media-server

# 3. Configure
cp .env.example .env
nano .env                       # set STREAM_DOMAIN, ACME_EMAIL, BACKEND_URL,
                                # MEDIA_SERVER_SECRET, PUBLIC_HLS_BASE
#   generate a secret:  openssl rand -hex 24

# 4. Launch (builds the MediaMTX+FFmpeg image, starts Caddy)
docker compose up -d --build

# 5. Check status / health / logs
docker compose ps
docker compose logs -f mediamtx
```

### Wire the backend (Render) — one time
Set these env vars on the backend so playback URLs and auth line up, then redeploy:

```
MEDIA_SERVER_SECRET = <same secret as media-server/.env>
RTMP_INGEST_URL     = rtmp://stream.eventlivepro.com/live   # shown in Studio
HLS_PLAYBACK_BASE   = https://stream.eventlivepro.com
```

> Keep the two OBS fields separate. Server is `rtmp://<domain>:1935/live`;
> Stream Key is the event key. Do not append the key to the Server field.

### Firewall
Open TCP `1935` (RTMP), `80` + `443` (HTTPS), and UDP `443` (HTTP/3).

```bash
sudo ufw allow 1935/tcp && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp
```

### Broadcaster setup (OBS)
- Service: **Custom**
- Server: `rtmp://stream.eventlivepro.com:1935/live`
- Stream Key: the key shown on the event's **Studio** page
- Recommended: 720p, 1500–2500 kbps (server caps output at 1000 kbps).

### How a stream flows
1. OBS publishes to MediaMTX with the event's stream key.
2. MediaMTX calls the backend to authorise the publish (`mediamtx-auth`).
3. `on_publish.sh` resolves the public short code, tells the app it's **live**, and
   starts FFmpeg.
4. FFmpeg writes ABR HLS to `/hls/<shortCode>/`; Caddy serves it over HTTPS.
5. The watch page auto-switches online and the HLS player plays it.
6. On disconnect, `on_unpublish.sh` tells the app it's **offline** and stops any
   recording.

### Update / restart
```bash
git pull
docker compose up -d --build      # rebuild + rolling restart
docker compose down               # stop everything
```

---

## B. Node alternative (`server.js`)

A single-process `node-media-server` + FFmpeg implementation with the same ABR
ladder and cap. You provide your own TLS in front of port `8000`.

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
npm install
cp .env.example .env   # uses BACKEND_URL / MEDIA_SERVER_SECRET / PUBLIC_HLS_BASE
node server.js
```

This path uses the backend's `/api/events/stream/auth` webhook (header secret)
rather than MediaMTX's `mediamtx-auth` query-token hook.

---

## Files
```
media-server/
├─ docker-compose.yml      # the one-click stack (mediamtx + caddy)
├─ Caddyfile               # automatic HTTPS + HLS file serving + CORS
├─ mediamtx/
│  ├─ Dockerfile           # alpine + mediamtx + ffmpeg + bash/curl/jq
│  └─ mediamtx.yml         # RTMP-only, http auth, runOn hooks
├─ scripts/
│  ├─ on_publish.sh        # auth-resolve, notify live, start transcode/record
│  ├─ transcode.sh         # FFmpeg ABR (240–720, 1000 kbps cap)
│  └─ on_unpublish.sh      # notify offline, stop recording
├─ server.js               # alternative Node engine (option B)
└─ .env.example
```
