# Nginx front for MediaMTX (domain-only playback)

OBS publishes RTMP straight to MediaMTX. Browsers play HLS only via
`https://stream.eventlivepro.com` — never via the VPS IP or ports 8888/8889.

| Path | Where it goes |
|------|----------------|
| `rtmp://stream.eventlivepro.com:1935/live/<key>` | MediaMTX `:1935` (public) |
| `https://stream.eventlivepro.com/live/<id>/index.m3u8` | Nginx → `127.0.0.1:8888` |
| `https://stream.eventlivepro.com/live/<id>/whep` | Nginx → `127.0.0.1:8889` |

MediaMTX HLS/WebRTC/API are bound to localhost in
`mediamtx/mediamtx-vps-native.yml`. UFW should allow `1935`, `80`, `443`
(and optionally UDP `8189` for WebRTC ICE) — not `8888`/`8889`.
