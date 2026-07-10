import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { env } from '../config/env.js';

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

/** MediaMTX native HLS: http://host:8888/live/<streamKey>/index.m3u8 */
export function deriveHlsPlaybackUrl(event) {
  if (event.hlsUrl) return event.hlsUrl;
  const key = resolveStreamKey(event);
  if (!env.hlsPlaybackBase || !key) return '';
  return `${env.hlsPlaybackBase}/live/${key}/index.m3u8`;
}

/** MediaMTX WebRTC/WHEP: http://host:8889/live/<streamKey>/whep */
export function deriveWebRtcPlaybackUrl(event) {
  if (event.webrtcUrl) return event.webrtcUrl;
  const key = resolveStreamKey(event);
  if (!env.webrtcPlaybackBase || !key) return '';
  return `${env.webrtcPlaybackBase}/${mediamtxPathName(key)}/whep`;
}

export function buildRtmpCredentials(event) {
  const streamKey = resolveStreamKey(event);
  const ingestUrl = env.rtmpIngestUrl.replace(/\/+$/, '');
  const withKey = { ...(event.toObject?.() || event), rtmpStreamKey: streamKey };
  return {
    ingestUrl,
    streamKey,
    fullUrl: `${ingestUrl}/${streamKey}`,
    playbackUrl: deriveHlsPlaybackUrl(withKey),
    webrtcUrl: deriveWebRtcPlaybackUrl(withKey),
    mediamtxPath: mediamtxPathName(streamKey),
  };
}

/** Best-effort probe of MediaMTX path readiness (null = unknown). */
export async function probeMediaMtxPublishing(streamKey) {
  if (!env.mediamtxApiUrl || !streamKey) return null;
  const pathName = mediamtxPathName(streamKey);
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

export async function findEventByStreamKey(rawKey) {
  const key = parseMediaMtxPath(rawKey);
  if (!key) return null;
  const or = [{ rtmpStreamKey: key }];
  if (mongoose.isValidObjectId(key)) or.push({ _id: key });
  return Event.findOne({ $or: or }).select('+rtmpStreamKey');
}

export async function ensureEventStreamKey(event) {
  const expected = streamKeyFromEventId(event._id || event.id);
  if (!expected) return expected;
  if (event.rtmpStreamKey !== expected) {
    event.rtmpStreamKey = expected;
    await event.save();
  }
  return expected;
}
