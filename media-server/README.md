# EventLive Pro — Private Media Server (RTMP → HLS / ABR)

This is a **separate, self-contained service**. It is the "Private Server Streaming"
engine: it ingests RTMP, transcodes to adaptive HLS with FFmpeg, and serves the
playlists over HTTP. It talks to the main EventLive backend only over HTTP, so it
does not touch the existing app, database, or deployment.

> ⚠️ It must run on a **dedicated VM/VPS with FFmpeg** (e.g. a small cloud server).
> It cannot run on Vercel (static) or a standard Render web service — those can't
> accept RTMP on port 1935 or run long-lived FFmpeg transcodes.

## What it does

- Ingest: `rtmp://<host>:1935/live/<streamKey>` (point OBS / encoder here).
- Authenticates every publish against the backend (`POST /api/events/stream/auth`)
  using the per-event stream key. Unauthorized / expired keys are rejected.
- Transcodes one input into a capped **adaptive** ladder and a master playlist:
  | Rendition | Resolution | Max video bitrate |
  |-----------|------------|-------------------|
  | 240p | 426×240 | 300 kbps |
  | 360p | 640×360 | 500 kbps |
  | 480p | 854×480 | 800 kbps |
  | 720p | 1280×720 | **1000 kbps (hard cap)** |

  No output ever exceeds **1000 kbps**, no matter what bitrate the customer pushes
  (500 / 800 / 1500 / 4000 / 8000 kbps are all transcoded down). `veryfast` preset
  keeps CPU usage reasonable for many concurrent streams.
- Playback (served by this server, behind TLS/CDN):
  `https://stream.eventlivepro.com/live/<shortCode>/master.m3u8`
- Optional MP4 recording per event (enabled by the backend auth response).
- Reports stream start/stop back to the backend so the watch page flips
  online/offline and the playback URL is stored automatically.

## Run with Docker (recommended)

```bash
cp .env.example .env   # then edit BACKEND_URL, MEDIA_SERVER_SECRET, PUBLIC_HLS_BASE
docker build -t eventlive-media .
docker run -d --name eventlive-media \
  --env-file .env \
  -p 1935:1935 -p 8000:8000 \
  -v /opt/eventlive/media:/data/media \
  eventlive-media
```

## Run with Node (bare metal)

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
npm install
cp .env.example .env   # edit values
npm start
```

## Required wiring (one-time)

1. **DNS**: point `stream.eventlivepro.com` (A record) at this VM's public IP.
2. **TLS for HLS**: put Nginx/Caddy in front of `:8000` to serve
   `https://stream.eventlivepro.com/` with a cert, proxying to `127.0.0.1:8000`.
   (RTMP on `:1935` stays plain — that's normal.)
3. **Backend env** (Render): set the matching values
   - `MEDIA_SERVER_SECRET` = same secret as here
   - `RTMP_INGEST_URL=rtmp://stream.eventlivepro.com/live`
   - `HLS_PLAYBACK_BASE=https://stream.eventlivepro.com`
4. **Firewall**: open TCP `1935` (RTMP) and `443` (HLS via your TLS proxy).

## Broadcaster setup (OBS)

- Service: Custom
- Server: `rtmp://stream.eventlivepro.com/live`
- Stream Key: the key shown in the event's Studio page
- Recommended encoder output: 720p, 1000–2500 kbps (the server caps output at 1000 kbps).

## Notes

- `dotenv` is optional (only used for local `.env`); production reads real env vars.
- Viewer counts, chat and live status are handled by the main app over Socket.IO —
  this server is purely ingest + transcode + playback.
