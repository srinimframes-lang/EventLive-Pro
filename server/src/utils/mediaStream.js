import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import {
  env,
  MEDIAMTX_VPS_HOST,
  STREAM_PUBLIC_DOMAIN,
  normalizeRtmpIngestUrl,
} from '../config/env.js';
import {
  getOriginHlsPlaybackBase,
  getViewerHlsPlaybackBase,
  isHlsCdnEnabled,
  rewriteViewerHlsUrl,
} from './hlsCdn.js';

export { MEDIAMTX_VPS_HOST, STREAM_PUBLIC_DOMAIN };

/** Deterministic stream key derived from the MongoDB event id. */
export function streamKeyFromEventId(eventId) {
  if (!eventId) return '';
  return String(eventId).trim();
}

/**
 * Adaptive HLS (ABR) is ON unless explicitly disabled.
 * Live only — recordings stay original single-file quality.
 */
export function isAdaptiveStreamingEnabled(event = {}) {
  if (event && event.adaptiveStreaming === false) return false;
  return true;
}

/** Viewer playlist filename: master.m3u8 (ABR) or index.m3u8 (single quality). */
export function hlsPlaylistName(event = {}) {
  return isAdaptiveStreamingEnabled(event) ? 'master.m3u8' : 'index.m3u8';
}

/** Parse MediaMTX path values such as `live/<streamKey>`. */
export function parseMediaMtxPath(path) {
  const p = String(path || '').trim().replace(/^\/+/, '');
  const liveMatch = p.match(/^live\/([^/]+)/i);
  if (liveMatch) return liveMatch[1];
  return p;
}

export function mediamtxPathName(streamKey) {
  return `live/${streamKey}`;
}

export function resolveStreamKey(event) {
  return event.rtmpStreamKey || streamKeyFromEventId(event._id || event.id);
}

/** Origin HLS URL (stream.eventlivepro.com) — for DB storage / health probes. */
export function buildOriginHlsPlaybackUrl(streamKey, eventOrOpts = {}) {
  const key = String(streamKey || '').trim();
  const base = getOriginHlsPlaybackBase();
  if (!base || !key) return '';
  const playlist = hlsPlaylistName(eventOrOpts);
  return `${base}/live/${key}/${playlist}`;
}

/**
 * Viewer HLS URL — respects CDN toggle.
 * Adaptive ON  → .../live/{key}/master.m3u8
 * Adaptive OFF → .../live/{key}/index.m3u8
 */
export function buildHlsPlaybackUrl(streamKey, eventOrOpts = {}) {
  const key = String(streamKey || '').trim();
  const base = getViewerHlsPlaybackBase();
  if (!base || !key) return '';
  const playlist = hlsPlaylistName(eventOrOpts);
  return `${base}/live/${key}/${playlist}`;
}

/**
 * Upgrade legacy http:// IP:port playback URLs to HTTPS, then apply viewer base
 * (stream or CDN) for /live/... playlists only.
 */
export function normalizePlaybackUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  let next = trimmed;
  if (env.requireSecurePlayback && next.startsWith('http://')) {
    const pathMatch = next.match(/(\/live\/[^/]+\/(?:index|master)\.m3u8)$/i);
    const origin = getOriginHlsPlaybackBase();
    if (pathMatch && origin) {
      next = `${origin}${pathMatch[1]}`;
    } else if (origin) {
      next = next.replace(/^http:\/\/[^/]+/, origin);
    }
  }

  // Viewer CDN rewrite — only /live/... HLS paths; never RTMP or recording URLs.
  return rewriteViewerHlsUrl(next);
}

/**
 * Viewer-facing MediaMTX / ABR HLS URL (CDN-aware).
 * Prefer rebuilding from stream key so the CDN + adaptive toggles apply.
 */
export function deriveHlsPlaybackUrl(event) {
  const key = resolveStreamKey(event);
  if (key) return buildHlsPlaybackUrl(key, event);
  if (event.hlsUrl) return normalizePlaybackUrl(event.hlsUrl);
  return '';
}

/**
 * Origin playlist for health / publish probes — prefer MediaMTX single-quality
 * index so failover works even before ABR master is ready.
 */
export function deriveOriginHlsPlaybackUrl(event) {
  const key = resolveStreamKey(event);
  if (key) {
    const base = getOriginHlsPlaybackBase();
    return base ? `${base}/live/${key}/index.m3u8` : '';
  }
  if (event.hlsUrl) {
    const pathMatch = String(event.hlsUrl).match(/(\/live\/[^/]+\/(?:index|master)\.m3u8)$/i);
    if (pathMatch) {
      return `${getOriginHlsPlaybackBase()}${pathMatch[1].replace(/master\.m3u8$/i, 'index.m3u8')}`;
    }
  }
  return '';
}

/** MediaMTX WebRTC/WHEP via HTTPS reverse proxy (origin — not CDN). */
export function deriveWebRtcPlaybackUrl(event) {
  if (event.webrtcUrl) {
    const trimmed = String(event.webrtcUrl).trim();
    if (env.requireSecurePlayback && trimmed.startsWith('http://') && env.webrtcPlaybackBase) {
      return trimmed.replace(/^http:\/\/[^/]+/, env.webrtcPlaybackBase);
    }
    return trimmed;
  }
  const key = resolveStreamKey(event);
  if (!env.webrtcPlaybackBase || !key) return '';
  return `${env.webrtcPlaybackBase}/${mediamtxPathName(key)}/whep`;
}

export function buildRtmpCredentials(event) {
  const streamKey = resolveStreamKey(event);
  const ingestUrl = normalizeRtmpIngestUrl(env.rtmpIngestUrl);
  const eventLike = { ...(event.toObject?.() || event), rtmpStreamKey: streamKey };
  return {
    ingestUrl,
    streamKey,
    fullUrl: `${ingestUrl}/${streamKey}`,
    // Viewer playback may use CDN + ABR master; OBS ingest URLs are unchanged above.
    playbackUrl: buildHlsPlaybackUrl(streamKey, eventLike),
    webrtcUrl: deriveWebRtcPlaybackUrl(eventLike),
    mediamtxPath: mediamtxPathName(streamKey),
    hlsCdnEnabled: isHlsCdnEnabled(),
    hlsPlaybackBase: getViewerHlsPlaybackBase(),
    adaptiveStreaming: isAdaptiveStreamingEnabled(eventLike),
  };
}

/** Always return canonical Premium Server URLs (ignores stale DB values). */
export function freshServerStreamUrls(event) {
  if (event.streamProvider !== 'rtmp') return null;
  return buildRtmpCredentials(event);
}

/**
 * Persist RTMP URL, stream key, and ORIGIN HLS URL on Premium Server events.
 * DB always stores stream.eventlivepro.com — CDN is applied at read/viewer time only.
 */
export function syncServerStreamFields(event) {
  if (event.streamProvider !== 'rtmp') return null;
  const key = streamKeyFromEventId(event._id || event.id);
  if (!key) return null;
  const eventLike = { ...(event.toObject?.() || event), rtmpStreamKey: key };
  const creds = buildRtmpCredentials(eventLike);
  event.rtmpStreamKey = creds.streamKey;
  event.rtmpPublishUrl = creds.fullUrl;
  event.hlsUrl = buildOriginHlsPlaybackUrl(key, eventLike);
  return creds;
}

async function probeMediaMtxPathReady(pathName) {
  if (!env.mediamtxApiUrl || !pathName) return null;
  try {
    const res = await fetch(
      `${env.mediamtxApiUrl}/v3/paths/get/${encodeURIComponent(pathName)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const data = await res.json();
    return Boolean(data.ready);
  } catch {
    return null;
  }
}

/** Short TTL cache so Watch-page stream polls do not hammer MediaMTX API. */
const publishingProbeCache = new Map();
const PUBLISHING_PROBE_TTL_MS = 2500;

/**
 * Best-effort probe of MediaMTX path readiness (null = unknown).
 * Also accepts OBS misconfiguration that publishes to live/<key>/<key>.
 */
export async function probeMediaMtxPublishing(streamKey) {
  if (!env.mediamtxApiUrl || !streamKey) return null;
  const key = String(streamKey || '').trim();
  const cached = publishingProbeCache.get(key);
  if (cached && Date.now() - cached.at < PUBLISHING_PROBE_TTL_MS) {
    return cached.value;
  }

  const canonical = await probeMediaMtxPathReady(mediamtxPathName(key));
  let value;
  if (canonical === true) {
    value = true;
  } else {
    const nested = await probeMediaMtxPathReady(`${mediamtxPathName(key)}/${key}`);
    if (nested === true) value = true;
    else if (canonical === false && nested === false) value = false;
    else value = null;
  }

  publishingProbeCache.set(key, { at: Date.now(), value });
  if (publishingProbeCache.size > 500) {
    const cutoff = Date.now() - PUBLISHING_PROBE_TTL_MS * 4;
    for (const [k, v] of publishingProbeCache) {
      if (v.at < cutoff) publishingProbeCache.delete(k);
    }
  }
  return value;
}

export async function findEventByStreamKey(rawKey) {
  const key = parseMediaMtxPath(rawKey);
  if (!key) return null;
  const or = [{ rtmpStreamKey: key }];
  if (mongoose.isValidObjectId(key)) or.push({ _id: key });
  return Event.findOne({ $or: or }).select('+rtmpStreamKey +youtubeStreamKey +facebookStreamKey');
}

export async function ensureEventStreamKey(event) {
  const creds = syncServerStreamFields(event);
  if (!creds) return '';
  await event.save();
  return creds.streamKey;
}
