import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import {
  env,
  MEDIAMTX_VPS_HOST,
  STREAM_PUBLIC_DOMAIN,
  normalizeRtmpIngestUrl,
} from '../config/env.js';

export { MEDIAMTX_VPS_HOST, STREAM_PUBLIC_DOMAIN };

/** Deterministic stream key derived from the MongoDB event id. */
export function streamKeyFromEventId(eventId) {
  if (!eventId) return '';
  return String(eventId).trim();
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

/** Build canonical HLS URL for a stream key using the configured (HTTPS) base. */
export function buildHlsPlaybackUrl(streamKey) {
  const key = String(streamKey || '').trim();
  if (!env.hlsPlaybackBase || !key) return '';
  return `${env.hlsPlaybackBase}/live/${key}/index.m3u8`;
}

/**
 * Upgrade legacy http:// IP:port playback URLs to the configured HTTPS base so
 * https://eventlivepro.com watch pages never hit mixed-content blocks.
 */
export function normalizePlaybackUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  if (!env.requireSecurePlayback) return trimmed;
  if (trimmed.startsWith('https://')) return trimmed;

  if (trimmed.startsWith('http://')) {
    const pathMatch = trimmed.match(/(\/live\/[^/]+\/index\.m3u8)$/);
    if (pathMatch && env.hlsPlaybackBase) {
      return `${env.hlsPlaybackBase}${pathMatch[1]}`;
    }
    if (env.hlsPlaybackBase) {
      return trimmed.replace(/^http:\/\/[^/]+/, env.hlsPlaybackBase);
    }
  }

  return trimmed;
}

/** MediaMTX native HLS via HTTPS reverse proxy. */
export function deriveHlsPlaybackUrl(event) {
  const key = resolveStreamKey(event);
  if (event.hlsUrl) return normalizePlaybackUrl(event.hlsUrl);
  return buildHlsPlaybackUrl(key);
}

/** MediaMTX WebRTC/WHEP via HTTPS reverse proxy. */
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
  return {
    ingestUrl,
    streamKey,
    fullUrl: `${ingestUrl}/${streamKey}`,
    playbackUrl: buildHlsPlaybackUrl(streamKey),
    webrtcUrl: deriveWebRtcPlaybackUrl({ ...(event.toObject?.() || event), rtmpStreamKey: streamKey }),
    mediamtxPath: mediamtxPathName(streamKey),
  };
}

/** Always return canonical Premium Server URLs (ignores stale DB values). */
export function freshServerStreamUrls(event) {
  if (event.streamProvider !== 'rtmp') return null;
  return buildRtmpCredentials(event);
}

/** Persist RTMP URL, stream key, and HTTPS HLS playback URL on Premium Server events. */
export function syncServerStreamFields(event) {
  if (event.streamProvider !== 'rtmp') return null;
  const key = streamKeyFromEventId(event._id || event.id);
  if (!key) return null;
  const creds = buildRtmpCredentials({ ...(event.toObject?.() || event), rtmpStreamKey: key });
  event.rtmpStreamKey = creds.streamKey;
  event.rtmpPublishUrl = creds.fullUrl;
  event.hlsUrl = creds.playbackUrl;
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
  return Event.findOne({ $or: or }).select('+rtmpStreamKey');
}

export async function ensureEventStreamKey(event) {
  const creds = syncServerStreamFields(event);
  if (!creds) return '';
  await event.save();
  return creds.streamKey;
}
