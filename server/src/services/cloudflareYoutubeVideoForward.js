/**
 * Cloudflare Stream Live → YouTube Live, video only.
 *
 * OBS → Cloudflare Live Input → EventLive website (unchanged CF HLS)
 *                         ↘ ffmpeg (-map 0:v:0 -an) → YouTube RTMP
 *
 * Does not use MediaMTX, Cloudflare simulcast outputs, or Anil Geetha.
 * Never logs RTMP targets or stream keys.
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { Event } from '../models/Event.js';
import { PROTECTED_CF_LIVE_INPUT_IDS, getLiveInputStatus } from './cloudflareStream.js';
import { buildYoutubeForwardTarget } from '../utils/youtubeForward.js';

export const CF_YT_VIDEO_FORWARD_INTERVAL_MS = 8000;

const AUDIO_TOKEN_RE = /^(?:-c:a|-acodec|-af|-filter_complex|anullsrc|lavfi|libfdk_aac)$/i;

/** @type {Map<string, { pid: number, child?: import('child_process').ChildProcess, hlsUrl: string }>} */
const forwards = new Map();

let timer = null;
let running = true;
let tickBusy = false;
let ffmpegMissingLogged = false;

function eventIdOf(event) {
  return String(event?._id || event?.id || '').trim();
}

export function pidDir() {
  return process.env.CF_YT_VIDEO_FORWARD_PID_DIR || path.join(os.tmpdir(), 'eventlive-cf-yt-videoonly');
}

function pidPathFor(eventId) {
  const safe = String(eventId || '').replace(/[^a-fA-F0-9]/g, '');
  if (!safe) return '';
  return path.join(pidDir(), `${safe}.pid`);
}

export function isPidAlive(pid, killFn = process.kill.bind(process)) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    killFn(n, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidFile(eventId) {
  const file = pidPathFor(eventId);
  if (!file) return 0;
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
}

function writePidFile(eventId, pid) {
  const file = pidPathFor(eventId);
  if (!file || !pid) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(pid), { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Best-effort; in-memory map is the primary tracker.
  }
}

function removePidFile(eventId) {
  const file = pidPathFor(eventId);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // ignore
  }
}

export function redactForwardSecrets(text, secrets = []) {
  let out = String(text || '');
  for (const secret of secrets) {
    const value = String(secret || '').trim();
    if (value.length < 4) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

function ffmpegStaticBin() {
  const bin = String(ffmpegStatic || '').trim();
  if (!bin) return '';
  try {
    if (fs.existsSync(bin)) return bin;
  } catch {
    // ignore missing binary on unsupported platforms
  }
  return '';
}

/**
 * Prefer FFMPEG_PATH, then the ffmpeg-static npm binary, then PATH `ffmpeg`.
 * Never hardcodes a machine-specific install location.
 */
export function resolveFfmpegBin() {
  const fromEnv = String(process.env.FFMPEG_PATH || '').trim();
  if (fromEnv) return fromEnv;
  return ffmpegStaticBin() || 'ffmpeg';
}

export function ffmpegLooksAvailable(bin = resolveFfmpegBin(), spawnSyncImpl = spawnSync) {
  try {
    const result = spawnSyncImpl(bin, ['-version'], { timeout: 4000, encoding: 'utf8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function isCloudflareYoutubeVideoForwardCandidate(event = {}) {
  if (String(event.liveIngestProvider || '') !== 'cloudflare_stream') return false;
  if (event.streamDisabled === true) return false;
  const uid = String(event.cfStreamLiveInputId || '').trim();
  if (!uid) return false;
  if (PROTECTED_CF_LIVE_INPUT_IDS.has(uid)) return false;
  if (!String(event.cfStreamHlsUrl || '').trim()) return false;
  if (!String(event.youtubeStreamKey || '').trim()) return false;
  return true;
}

/**
 * ffmpeg argv: Cloudflare HLS in, YouTube RTMP out, video only (no audio track).
 * Caller must not log the returned array (last item is the secret RTMP target).
 */
export function buildCloudflareYoutubeVideoOnlyFfmpegArgs({ hlsUrl, rtmpTarget } = {}) {
  const input = String(hlsUrl || '').trim();
  const target = String(rtmpTarget || '').trim();
  if (!input || !target) return [];
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-rw_timeout',
    '15000000',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-an',
    '-c:v',
    'copy',
    '-bsf:v',
    'h264_mp4toannexb',
    '-f',
    'flv',
    target,
  ];
}

export function ffmpegArgsAreVideoOnly(args = []) {
  const list = Array.isArray(args) ? args.map(String) : [];
  if (!list.includes('-an') || !list.includes('0:v:0')) return false;
  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];
    if (token === '-an') continue;
    if (token === '-map' && list[i + 1] && /^0:a/.test(list[i + 1])) return false;
    if (AUDIO_TOKEN_RE.test(token)) return false;
    if (token === '-c:a' || token === '-acodec') return false;
    if (/anullsrc|^aac$/i.test(token)) return false;
  }
  return true;
}

function logForward(message, extra) {
  if (extra === undefined) {
    // eslint-disable-next-line no-console
    console.info(`[cf-yt-video] ${message}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.info(`[cf-yt-video] ${message}`, extra);
}

function stopPid(pid, killFn) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return;
  try {
    killFn(n, 'SIGTERM');
  } catch {
    // already dead
  }
}

export function stopForward(eventId, { killFn = process.kill.bind(process) } = {}) {
  const id = String(eventId || '').trim();
  if (!id) return;
  const tracked = forwards.get(id);
  const pid = tracked?.pid || readPidFile(id);
  if (tracked?.child && typeof tracked.child.kill === 'function') {
    try {
      tracked.child.kill('SIGTERM');
    } catch {
      // ignore
    }
  } else {
    stopPid(pid, killFn);
  }
  forwards.delete(id);
  removePidFile(id);
}

export function getActiveCloudflareYoutubeVideoForwards() {
  return [...forwards.entries()].map(([eventId, info]) => ({
    eventId,
    pid: info.pid,
  }));
}

export function resetCloudflareYoutubeVideoForwardState(opts = {}) {
  running = true;
  for (const eventId of [...forwards.keys()]) {
    stopForward(eventId, opts);
  }
  forwards.clear();
  ffmpegMissingLogged = false;
}

function adoptOrStart({
  event,
  hlsUrl,
  rtmpTarget,
  streamKey,
  spawnFn,
  ffmpegBin,
  killFn,
}) {
  const eventId = eventIdOf(event);
  const tracked = forwards.get(eventId);
  if (tracked && isPidAlive(tracked.pid, killFn)) return { action: 'already_running', pid: tracked.pid };

  const filePid = readPidFile(eventId);
  if (filePid && isPidAlive(filePid, killFn)) {
    forwards.set(eventId, { pid: filePid, hlsUrl });
    return { action: 'adopted', pid: filePid };
  }
  if (filePid) removePidFile(eventId);

  const args = buildCloudflareYoutubeVideoOnlyFfmpegArgs({ hlsUrl, rtmpTarget });
  if (!args.length || !ffmpegArgsAreVideoOnly(args)) {
    logForward('skip invalid video-only args', { eventId });
    return { action: 'invalid_args' };
  }

  let child;
  try {
    child = spawnFn(ffmpegBin, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
  } catch (err) {
    logForward('ffmpeg spawn failed', { eventId, error: String(err?.message || err) });
    return { action: 'spawn_failed' };
  }

  const pid = Number(child?.pid) || 0;
  if (!pid) {
    logForward('ffmpeg spawn produced no pid', { eventId });
    return { action: 'spawn_failed' };
  }

  const secrets = [streamKey, rtmpTarget];
  let stderrBuf = '';
  if (child.stderr && typeof child.stderr.on === 'function') {
    child.stderr.on('data', (buf) => {
      const chunk = String(buf);
      stderrBuf += chunk;
      if (stderrBuf.length > 16_384) stderrBuf = stderrBuf.slice(-16_384);
      const msg = redactForwardSecrets(chunk, secrets).trim();
      if (msg) {
        // eslint-disable-next-line no-console
        console.warn(`[cf-yt-video] ffmpeg event=${eventId} ${msg}`);
      }
    });
  }
  if (typeof child.on === 'function') {
    child.on('error', (err) => {
      logForward('ffmpeg error', {
        eventId,
        pid,
        error: redactForwardSecrets(String(err?.message || err), secrets),
      });
    });
    child.on('exit', (code, signal) => {
      logForward('ffmpeg exited', {
        eventId,
        pid,
        code: code == null ? null : code,
        signal: signal || '',
        stderr: redactForwardSecrets(stderrBuf, secrets).trim(),
      });
      const current = forwards.get(eventId);
      if (current && current.pid === pid) {
        forwards.delete(eventId);
        removePidFile(eventId);
      }
    });
  }

  forwards.set(eventId, { pid, child, hlsUrl });
  writePidFile(eventId, pid);
  logForward('started', { eventId, pid });
  return { action: 'started', pid };
}

export async function runCloudflareYoutubeVideoForwardTick(deps = {}) {
  if (!running) return { skipped: true, reason: 'stopped' };

  const ffmpegBin = deps.ffmpegBin || resolveFfmpegBin();
  const ffmpegAvailable =
    typeof deps.ffmpegAvailable === 'boolean'
      ? deps.ffmpegAvailable
      : ffmpegLooksAvailable(ffmpegBin, deps.spawnSync);
  if (!ffmpegAvailable) {
    if (!ffmpegMissingLogged) {
      logForward('ffmpeg not available — video-only YouTube forward idle');
      ffmpegMissingLogged = true;
    }
    return { skipped: true, reason: 'ffmpeg_missing' };
  }

  const listEvents =
    deps.listEvents ||
    (async () =>
      Event.find({
        liveIngestProvider: 'cloudflare_stream',
        streamDisabled: { $ne: true },
      })
        .select('+youtubeStreamKey')
        .limit(100));
  const getStatus = deps.getLiveInputStatus || getLiveInputStatus;
  const spawnFn = deps.spawn || spawn;
  const killFn = deps.killFn || process.kill.bind(process);

  const events = (await listEvents()) || [];
  const seen = new Set();
  const results = [];

  for (const event of events) {
    const eventId = eventIdOf(event);
    if (!eventId) continue;
    if (!isCloudflareYoutubeVideoForwardCandidate(event)) continue;
    seen.add(eventId);

    const hlsUrl = String(event.cfStreamHlsUrl || '').trim();
    const streamKey = String(event.youtubeStreamKey || '').trim();
    const rtmpTarget = buildYoutubeForwardTarget(event.youtubeRtmpUrl, streamKey);
    if (!rtmpTarget) {
      results.push({ eventId, action: 'missing_target' });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const status = await getStatus(event.cfStreamLiveInputId);
    if (status?.isPublishing === true) {
      const started = adoptOrStart({
        event,
        hlsUrl,
        rtmpTarget,
        streamKey,
        spawnFn,
        ffmpegBin,
        killFn,
      });
      results.push({ eventId, ...started });
    } else if (status?.isPublishing === false) {
      if (forwards.has(eventId) || readPidFile(eventId)) {
        stopForward(eventId, { killFn });
        results.push({ eventId, action: 'stopped' });
      } else {
        results.push({ eventId, action: 'idle' });
      }
    } else {
      results.push({ eventId, action: 'status_unknown' });
    }
  }

  for (const eventId of [...forwards.keys()]) {
    if (!seen.has(eventId)) {
      stopForward(eventId, { killFn });
      results.push({ eventId, action: 'stopped_stale' });
    }
  }

  return { skipped: false, results };
}

/**
 * Start the Cloudflare HLS → YouTube video-only restream worker.
 */
export function startCloudflareYoutubeVideoForwardWorker(deps = {}) {
  if (String(process.env.CF_YT_VIDEO_FORWARD || '1') === '0') {
    logForward('disabled (CF_YT_VIDEO_FORWARD=0)');
    return { stop: stopCloudflareYoutubeVideoForwardWorker };
  }
  if (timer) return { stop: stopCloudflareYoutubeVideoForwardWorker };
  running = true;
  logForward(`worker started (every ${CF_YT_VIDEO_FORWARD_INTERVAL_MS / 1000}s)`);
  const tick = () => {
    if (tickBusy) return;
    tickBusy = true;
    runCloudflareYoutubeVideoForwardTick(deps)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[cf-yt-video] tick failed:', err?.message || err);
      })
      .finally(() => {
        tickBusy = false;
      });
  };
  timer = setInterval(tick, CF_YT_VIDEO_FORWARD_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: stopCloudflareYoutubeVideoForwardWorker };
}

export function stopCloudflareYoutubeVideoForwardWorker() {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
