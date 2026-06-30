'use strict';

/**
 * EventLive Pro — Private Media Server
 * ------------------------------------
 * Accepts RTMP ingest at  rtmp://<host>:<RTMP_PORT>/live/<streamKey>
 * and produces adaptive HLS (240p/360p/480p/720p) served over HTTP at
 *   http://<host>:<HTTP_PORT>/live/<shortCode>/master.m3u8
 *
 * Safety/spec:
 *  - Every publish is authenticated against the EventLive backend using the
 *    stream key (prevents unauthorized publishing; keys expire when the event
 *    ends — the backend rejects them).
 *  - All output renditions are bitrate-capped (<= 1000 kbps) regardless of the
 *    incoming bitrate, protecting the server and keeping playback smooth.
 *  - Optional per-event recording to MP4.
 *
 * This service is meant to run on a dedicated VM with FFmpeg installed. It does
 * NOT touch the existing app and has no shared database — it talks to the
 * backend over HTTP only.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const NodeMediaServer = require('node-media-server');

try {
  // Optional: load a local .env in dev. In production, env comes from the host.
  require('dotenv').config();
} catch {
  /* dotenv not installed — rely on real environment variables */
}

const cfg = {
  rtmpPort: Number(process.env.RTMP_PORT) || 1935,
  httpPort: Number(process.env.HTTP_PORT) || 8000,
  ffmpeg: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  mediaRoot: path.resolve(process.env.MEDIA_ROOT || './media'),
  backendUrl: (process.env.BACKEND_URL || '').replace(/\/+$/, ''),
  secret: process.env.MEDIA_SERVER_SECRET || '',
  publicHlsBase: (process.env.PUBLIC_HLS_BASE || '').replace(/\/+$/, ''),
};

// ── Bitrate ladder ────────────────────────────────────────────────────────
// Output is ALWAYS capped: no rendition exceeds MAX_OUTPUT_KBPS, whatever the
// customer pushes (500/800/1500/4000/8000 kbps all transcode down to this).
const MAX_OUTPUT_KBPS = 1000;
const LADDER = [
  { name: '240p', width: 426, height: 240, vKbps: 300, aKbps: 64 },
  { name: '360p', width: 640, height: 360, vKbps: 500, aKbps: 96 },
  { name: '480p', width: 854, height: 480, vKbps: 800, aKbps: 96 },
  { name: '720p', width: 1280, height: 720, vKbps: MAX_OUTPUT_KBPS, aKbps: 128 },
].map((r) => ({ ...r, vKbps: Math.min(r.vKbps, MAX_OUTPUT_KBPS) }));

const sessions = new Map(); // streamKey -> { proc, recProc, shortCode, dir }

function log(...a) {
  // eslint-disable-next-line no-console
  console.log(`[media] ${new Date().toISOString()}`, ...a);
}

function keyFromPath(streamPath) {
  // /live/<streamKey>
  const parts = String(streamPath || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

async function authenticate(streamKey) {
  if (!cfg.backendUrl) {
    log('WARN: BACKEND_URL not set — refusing all publishes for safety.');
    return null;
  }
  try {
    const res = await fetch(`${cfg.backendUrl}/api/events/stream/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-media-secret': cfg.secret },
      body: JSON.stringify({ streamKey }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Expected: { ok: true, shortCode, autoRecord }
    return data?.ok ? data : null;
  } catch (e) {
    log('auth error', e.message);
    return null;
  }
}

async function notifyBackend(pathname, body) {
  if (!cfg.backendUrl) return;
  try {
    await fetch(`${cfg.backendUrl}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-media-secret': cfg.secret },
      body: JSON.stringify(body),
    });
  } catch (e) {
    log('notify error', e.message);
  }
}

/**
 * Builds the FFmpeg arguments for a single-input → 4-variant ABR HLS output
 * with a master playlist. Uses veryfast preset to keep CPU usage reasonable.
 */
function buildFfmpegArgs(streamKey, outDir) {
  const input = `rtmp://127.0.0.1:${cfg.rtmpPort}/live/${streamKey}`;
  const splits = LADDER.map((_, i) => `[v${i}]`).join('');
  const filter = [
    `[0:v]split=${LADDER.length}${splits}`,
    ...LADDER.map(
      (r, i) =>
        `[v${i}]scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=${r.width}:${r.height}:(ow-iw)/2:(oh-ih)/2[v${i}out]`
    ),
  ].join(';');

  const args = ['-loglevel', 'warning', '-i', input, '-filter_complex', filter];

  LADDER.forEach((r, i) => {
    args.push(
      '-map', `[v${i}out]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, `${r.vKbps}k`,
      `-maxrate:v:${i}`, `${r.vKbps}k`,
      `-bufsize:v:${i}`, `${r.vKbps * 2}k`,
      '-preset', 'veryfast',
      '-profile:v', 'main',
      '-sc_threshold', '0',
      '-g', '48',
      '-keyint_min', '48'
    );
  });

  // One audio output per variant.
  LADDER.forEach((r, i) => {
    args.push('-map', 'a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${r.aKbps}k`, '-ac', '2');
  });

  const varMap = LADDER.map((_, i) => `v:${i},a:${i}`).join(' ');
  args.push(
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments',
    '-hls_segment_type', 'mpegts',
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', path.join(outDir, '%v', 'seg_%03d.ts'),
    '-var_stream_map', varMap,
    path.join(outDir, '%v', 'index.m3u8')
  );

  return args;
}

function startTranscode(streamKey, shortCode) {
  const outDir = path.join(cfg.mediaRoot, 'live', shortCode);
  // Ensure per-variant directories exist (FFmpeg needs them).
  LADDER.forEach((_, i) => fs.mkdirSync(path.join(outDir, String(i)), { recursive: true }));

  const args = buildFfmpegArgs(streamKey, outDir);
  log(`transcode start ${shortCode} ->`, outDir);
  const proc = spawn(cfg.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (d) => log(`ffmpeg[${shortCode}]`, String(d).trim()));
  proc.on('close', (code) => log(`transcode ${shortCode} exited`, code));

  return { proc, dir: outDir };
}

function startRecording(streamKey, shortCode) {
  const recDir = path.join(cfg.mediaRoot, 'recordings', shortCode);
  fs.mkdirSync(recDir, { recursive: true });
  const file = path.join(recDir, `${Date.now()}.mp4`);
  const args = [
    '-loglevel', 'error',
    '-i', `rtmp://127.0.0.1:${cfg.rtmpPort}/live/${streamKey}`,
    '-c', 'copy',
    '-f', 'mp4',
    file,
  ];
  log(`recording start ${shortCode} ->`, file);
  const recProc = spawn(cfg.ffmpeg, args, { stdio: 'ignore' });
  recProc.on('close', (code) => log(`recording ${shortCode} exited`, code));
  return recProc;
}

// ── Node Media Server ──────────────────────────────────────────────────────
const nms = new NodeMediaServer({
  rtmp: {
    port: cfg.rtmpPort,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: cfg.httpPort,
    mediaroot: cfg.mediaRoot,
    allow_origin: '*',
  },
});

nms.on('prePublish', async (id, streamPath) => {
  const streamKey = keyFromPath(streamPath);
  const auth = await authenticate(streamKey);
  const session = nms.getSession(id);
  if (!auth) {
    log('REJECT publish (invalid/expired key):', streamKey.slice(0, 6) + '…');
    session.reject();
    return;
  }

  const existing = sessions.get(streamKey);
  if (existing) {
    // Already publishing — stop the previous transcode (restart scenario).
    try { existing.proc?.kill('SIGKILL'); } catch { /* noop */ }
    try { existing.recProc?.kill('SIGKILL'); } catch { /* noop */ }
  }

  const { proc, dir } = startTranscode(streamKey, auth.shortCode);
  const recProc = auth.autoRecord ? startRecording(streamKey, auth.shortCode) : null;
  sessions.set(streamKey, { proc, recProc, shortCode: auth.shortCode, dir });

  const playbackUrl = `${cfg.publicHlsBase}/live/${auth.shortCode}/master.m3u8`;
  await notifyBackend('/api/events/stream/started', { streamKey, shortCode: auth.shortCode, playbackUrl });
});

nms.on('donePublish', async (id, streamPath) => {
  const streamKey = keyFromPath(streamPath);
  const s = sessions.get(streamKey);
  if (s) {
    try { s.proc?.kill('SIGKILL'); } catch { /* noop */ }
    try { s.recProc?.kill('SIGKILL'); } catch { /* noop */ }
    sessions.delete(streamKey);
  }
  await notifyBackend('/api/events/stream/stopped', { streamKey });
  log('donePublish', streamKey.slice(0, 6) + '…');
});

nms.run();
log(`RTMP ingest on :${cfg.rtmpPort}  ·  HLS on :${cfg.httpPort}  ·  media=${cfg.mediaRoot}`);
log(`Output capped at ${MAX_OUTPUT_KBPS} kbps across ${LADDER.map((r) => r.name).join('/')}`);

