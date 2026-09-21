/**
 * Mux Live Stream API — dedicated Live Stream per new Mux event.
 * Never logs or returns RTMP stream keys in error messages.
 *
 * OBS → rtmps://global-live.mux.com:443/app + stream key
 * Viewers → Mux Player / HLS via playback ID (live) or asset playback ID (VOD).
 */
import mongoose from 'mongoose';
import { Event } from '../models/Event.js';

const MUX_API_BASE = 'https://api.mux.com/video/v1';
const REQUEST_TIMEOUT_MS = 15000;
const SECRET_KEY_RE = /token|secret|authorization|key|password|stream_key/i;

/** Official Mux RTMPS ingest for OBS. Stream key stays in the OBS key field only. */
export const MUX_RTMPS_INGEST_URL = 'rtmps://global-live.mux.com:443/app';

export class MuxStreamError extends Error {
  constructor(message, { statusCode = 502, code = 'mux_stream_error' } = {}) {
    super(message);
    this.name = 'MuxStreamError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getMuxConfig() {
  const tokenId = String(process.env.MUX_TOKEN_ID || '').trim();
  const tokenSecret = String(process.env.MUX_TOKEN_SECRET || '').trim();
  return {
    tokenId,
    tokenSecret,
    configured: Boolean(tokenId && tokenSecret),
  };
}

export function isMuxEvent(event = {}) {
  return String(event.streamingProvider || '').trim().toLowerCase().replace(/-/g, '_') === 'mux';
}

export function shouldProvisionMuxLive(payload = {}) {
  if (!isMuxEvent(payload)) return false;
  return !String(payload.muxLiveStreamId || '').trim();
}

export function liveStreamPassthrough({ eventId, slug = '' } = {}) {
  const id = String(eventId || '').trim();
  const slugPart = String(slug || '')
    .trim()
    .slice(0, 48);
  if (id && slugPart) return `eventlivepro:${id}:${slugPart}`.slice(0, 255);
  if (id) return `eventlivepro:${id}`.slice(0, 255);
  return 'eventlivepro:new-event';
}

export function normalizeMuxRtmpUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return MUX_RTMPS_INGEST_URL;
  try {
    const parsed = new URL(trimmed.replace(/^rtmps:/i, 'https:').replace(/^rtmp:/i, 'http:'));
    const host = parsed.hostname.toLowerCase();
    if (host === 'global-live.mux.com' || host.endsWith('.live.mux.com')) {
      return MUX_RTMPS_INGEST_URL;
    }
  } catch {
    /* fall through */
  }
  return MUX_RTMPS_INGEST_URL;
}

export function normalizeMuxStreamKey(raw) {
  return String(raw || '').trim();
}

export function publicPlaybackIdFromList(playbackIds) {
  const list = Array.isArray(playbackIds) ? playbackIds : [];
  const publicId = list.find((item) => String(item?.policy || '').toLowerCase() === 'public');
  const chosen = publicId || list[0];
  return String(chosen?.id || '').trim();
}

export function muxHlsUrl(playbackId) {
  const id = String(playbackId || '').trim();
  return id ? `https://stream.mux.com/${id}.m3u8` : '';
}

export function muxPlayerUrl(playbackId, { mode = 'live', poster = '' } = {}) {
  const id = String(playbackId || '').trim();
  if (!id) return '';
  const url = new URL(`https://player.mux.com/${id}`);
  url.searchParams.set('autoplay', 'true');
  url.searchParams.set('muted', 'true');
  url.searchParams.set('playsinline', 'true');
  if (mode === 'recorded') {
    url.searchParams.set('stream-type', 'on-demand');
  } else {
    url.searchParams.set('stream-type', 'live');
  }
  const posterUrl = String(poster || '').trim();
  if (posterUrl) url.searchParams.set('poster', posterUrl);
  return url.toString();
}

export function mapLiveStreamResult(data) {
  const liveStreamId = String(data?.id || '').trim();
  const playbackId = publicPlaybackIdFromList(data?.playback_ids);
  const streamKey = normalizeMuxStreamKey(data?.stream_key);
  if (!liveStreamId || !playbackId || !streamKey) {
    throw new MuxStreamError('Mux Live Stream response was incomplete', {
      statusCode: 502,
      code: 'mux_live_stream_incomplete',
    });
  }
  return {
    liveStreamId,
    playbackId,
    streamKey,
    rtmpUrl: normalizeMuxRtmpUrl(data?.rtmp?.url),
    status: String(data?.status || 'idle').trim().toLowerCase() || 'idle',
    recentAssetIds: Array.isArray(data?.recent_asset_ids)
      ? data.recent_asset_ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    activeAssetId: String(data?.active_asset_id || '').trim(),
  };
}

export function applyMuxLiveStreamFields(payload, liveStream) {
  payload.streamingProvider = 'mux';
  payload.streamProvider = 'none';
  payload.streamingDestination = undefined;
  payload.youtubeForwardEnabled = false;
  payload.muxLiveStreamId = liveStream.liveStreamId;
  payload.muxPlaybackId = liveStream.playbackId;
  payload.muxRtmpUrl = liveStream.rtmpUrl;
  payload.muxStreamKey = liveStream.streamKey;
  if (liveStream.status) payload.muxStatus = liveStream.status;
  payload.cfStreamLiveInputId = '';
  payload.cfStreamHlsUrl = '';
  payload.cfStreamRtmpsUrl = '';
  payload.cfStreamRtmpsKey = '';
  return payload;
}

function muxLog(step, extra) {
  if (extra === undefined) {
    // eslint-disable-next-line no-console
    console.info(`[mux-stream] ${step}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.info(`[mux-stream] ${step}`, sanitizeLogValue(extra));
}

function sanitizeLogValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || depth > 4) return String(value);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
  }
  const out = {};
  Object.entries(value).forEach(([key, val]) => {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = Boolean(val);
      return;
    }
    out[key] = sanitizeLogValue(val, depth + 1);
  });
  return out;
}

function describeApiError(json, httpStatus) {
  const first = Array.isArray(json?.error?.messages)
    ? json.error.messages[0]
    : json?.error?.messages;
  const apiMessage = String(first || json?.error || json?.message || '').slice(0, 180);
  return {
    httpStatus,
    type: json?.error?.type || '',
    message: apiMessage || `Mux request failed (HTTP ${httpStatus})`,
  };
}

function muxAuthHeader(config) {
  const { tokenId, tokenSecret } = config;
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`;
}

async function muxRequest(path, { method = 'GET', body, fetchImpl = fetch, config } = {}) {
  const cfg = config || getMuxConfig();
  if (!cfg.configured) {
    throw new MuxStreamError(
      'Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.',
      { statusCode: 503, code: 'mux_not_configured' },
    );
  }

  let res;
  try {
    res = await fetchImpl(`${MUX_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: muxAuthHeader(cfg),
        'Content-Type': 'application/json',
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    muxLog('request network error', {
      method,
      path,
      error: err.name || 'Error',
      message: String(err.message || 'network error').slice(0, 180),
    });
    throw new MuxStreamError(
      `Mux request failed: ${err.message || 'network error'}`,
      { statusCode: 502, code: 'mux_network_error' },
    );
  }

  if (res.status === 204) return null;

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const info = describeApiError(json, res.status);
    muxLog('api error', {
      method,
      path,
      httpStatus: info.httpStatus,
      type: info.type,
      message: info.message,
    });
    throw new MuxStreamError(info.message, {
      statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
      code: 'mux_api_error',
    });
  }

  return json?.data;
}

export function muxLiveStreamCreatePayload({ eventId, slug = '', title = '' } = {}) {
  return {
    playback_policies: ['public'],
    new_asset_settings: {
      playback_policies: ['public'],
    },
    reconnect_window: 60,
    latency_mode: 'standard',
    passthrough: liveStreamPassthrough({ eventId, slug: slug || title }),
  };
}

export async function createLiveStream({ eventId, slug = '', title = '' } = {}, deps = {}) {
  const data = await muxRequest('/live-streams', {
    method: 'POST',
    body: muxLiveStreamCreatePayload({ eventId, slug, title }),
    fetchImpl: deps.fetchImpl,
    config: deps.config,
  });
  const mapped = mapLiveStreamResult(data);
  muxLog('created live stream', {
    eventId: String(eventId || ''),
    liveStreamId: mapped.liveStreamId,
    playbackIdPresent: Boolean(mapped.playbackId),
    status: mapped.status,
  });
  return mapped;
}

export async function getLiveStream(liveStreamId, deps = {}) {
  const id = String(liveStreamId || '').trim();
  if (!id) {
    throw new MuxStreamError('Mux Live Stream id is required', {
      statusCode: 400,
      code: 'mux_live_stream_id_required',
    });
  }
  const data = await muxRequest(`/live-streams/${encodeURIComponent(id)}`, {
    fetchImpl: deps.fetchImpl,
    config: deps.config,
  });
  return mapLiveStreamResult(data);
}

export async function getAsset(assetId, deps = {}) {
  const id = String(assetId || '').trim();
  if (!id) return null;
  const data = await muxRequest(`/assets/${encodeURIComponent(id)}`, {
    fetchImpl: deps.fetchImpl,
    config: deps.config,
  });
  const playbackId = publicPlaybackIdFromList(data?.playback_ids);
  return {
    assetId: String(data?.id || id).trim(),
    status: String(data?.status || '').trim().toLowerCase(),
    playbackId,
    duration: Number(data?.duration) || 0,
  };
}

export async function deleteLiveStream(liveStreamId, deps = {}) {
  const id = String(liveStreamId || '').trim();
  if (!id) return { deleted: false };
  await muxRequest(`/live-streams/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    fetchImpl: deps.fetchImpl,
    config: deps.config,
  });
  muxLog('deleted live stream', { liveStreamId: id });
  return { deleted: true };
}

export function muxPublishingFromStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'active') return true;
  if (s === 'idle' || s === 'disabled') return false;
  if (s === 'disconnected' || s === 'waiting') return null;
  return null;
}

export async function getMuxPublishingStatus(event, deps = {}) {
  const id = String(event?.muxLiveStreamId || '').trim();
  if (!id) return null;
  try {
    const live = await getLiveStream(id, deps);
    return muxPublishingFromStatus(live.status);
  } catch {
    return null;
  }
}

/**
 * Public-safe Mux playback view. Never includes ingest URL or stream key.
 */
export function publicMuxPlayback(event = {}, { isLive = false, isPublishing = null } = {}) {
  const livePlaybackId = String(event.muxPlaybackId || '').trim();
  const vodPlaybackId = String(event.muxAssetPlaybackId || '').trim();
  const ended = event.status === 'ended' || event.status === 'cancelled';
  const muxStatus = String(event.muxStatus || '').trim().toLowerCase();
  const live =
    isPublishing === true ||
    (isPublishing !== false && (isLive || muxStatus === 'active'));
  const reconnecting = !live && (muxStatus === 'disconnected' || muxStatus === 'waiting');
  const vodReady = Boolean(vodPlaybackId);
  const recordingPreparing =
    !live &&
    !vodReady &&
    (muxStatus === 'idle' || muxStatus === 'disconnected') &&
    Boolean(String(event.muxAssetId || '').trim() || event.isLive === true || event.liveEndedAt);

  let playbackMode = 'offline';
  if (live) playbackMode = 'live';
  else if (reconnecting) playbackMode = 'reconnecting';
  else if (vodReady) playbackMode = 'recorded';
  else if (ended) playbackMode = 'offline';

  const playbackId = live ? livePlaybackId : vodReady ? vodPlaybackId : livePlaybackId;
  const poster = event.coverImage || '';
  return {
    muxLiveStreamId: String(event.muxLiveStreamId || '').trim(),
    muxPlaybackId: livePlaybackId,
    muxAssetId: String(event.muxAssetId || '').trim(),
    muxAssetPlaybackId: vodPlaybackId,
    muxStatus: muxStatus || undefined,
    playbackId,
    hlsUrl: muxHlsUrl(playbackId),
    playbackUrl: muxPlayerUrl(playbackId, {
      mode: live ? 'live' : vodReady ? 'recorded' : 'live',
      poster,
    }),
    muxPlayerUrl: muxPlayerUrl(live ? livePlaybackId : vodPlaybackId || livePlaybackId, {
      mode: live ? 'live' : vodReady ? 'recorded' : 'live',
      poster,
    }),
    isLive: live,
    reconnecting,
    playbackMode,
    muxRecordingPreparing: recordingPreparing && !vodReady,
  };
}

export async function resolveMuxRecordedAsset(event, liveStream, deps = {}) {
  const latestAssetId = String(liveStream?.recentAssetIds?.[0] || event.muxAssetId || '').trim();
  if (!latestAssetId) return null;
  if (
    latestAssetId === String(event.muxAssetId || '').trim() &&
    String(event.muxAssetPlaybackId || '').trim()
  ) {
    return {
      assetId: latestAssetId,
      playbackId: String(event.muxAssetPlaybackId || '').trim(),
      status: 'ready',
    };
  }
  try {
    const asset = await getAsset(latestAssetId, deps);
    if (!asset || asset.status !== 'ready' || !asset.playbackId) {
      return { assetId: latestAssetId, playbackId: '', status: asset?.status || 'preparing' };
    }
    return asset;
  } catch {
    return { assetId: latestAssetId, playbackId: '', status: 'preparing' };
  }
}

export async function syncMuxLiveStatus(event, isPublishing, deps = {}) {
  if (!isMuxEvent(event)) return event;
  const id = String(event.muxLiveStreamId || '').trim();
  if (!id) return event;

  let liveStream = null;
  try {
    liveStream = await getLiveStream(id, deps);
  } catch {
    return event;
  }

  const publishing =
    isPublishing === true || isPublishing === false
      ? isPublishing
      : muxPublishingFromStatus(liveStream.status);
  const nextStatus = liveStream.status || event.muxStatus;
  let dirty = false;

  if (nextStatus && event.muxStatus !== nextStatus) {
    event.muxStatus = nextStatus;
    dirty = true;
  }
  if (liveStream.playbackId && event.muxPlaybackId !== liveStream.playbackId) {
    event.muxPlaybackId = liveStream.playbackId;
    dirty = true;
  }

  if (publishing === true) {
    if (!event.isLive) {
      event.isLive = true;
      event.liveStartedAt = new Date();
      event.liveEndedAt = undefined;
      dirty = true;
    }
    if (event.status === 'draft' || event.status === 'published') {
      event.status = 'live';
      dirty = true;
    }
  } else if (publishing === false && event.isLive) {
    event.isLive = false;
    event.liveEndedAt = new Date();
    if (event.status === 'live') event.status = 'published';
    dirty = true;
  }

  if (publishing !== true) {
    const asset = await resolveMuxRecordedAsset(event, liveStream, deps);
    if (asset?.assetId && event.muxAssetId !== asset.assetId) {
      event.muxAssetId = asset.assetId;
      dirty = true;
    }
    if (asset?.playbackId && event.muxAssetPlaybackId !== asset.playbackId) {
      event.muxAssetPlaybackId = asset.playbackId;
      dirty = true;
    }
  }

  if (dirty && typeof event.save === 'function') {
    try {
      await event.save();
    } catch (err) {
      muxLog('persist status failed', { message: String(err.message || err).slice(0, 180) });
    }
  }
  return event;
}

function stripClientSuppliedMuxFields(payload) {
  delete payload.muxLiveStreamId;
  delete payload.muxPlaybackId;
  delete payload.muxRtmpUrl;
  delete payload.muxStreamKey;
  delete payload.muxAssetId;
  delete payload.muxAssetPlaybackId;
  delete payload.muxStatus;
}

/**
 * New Mux events get exactly one Mux Live Stream.
 * Failure aborts create. Existing Mux IDs are never replaced here.
 */
export async function createEventWithMuxLive(payload, deps = {}) {
  const EventModel = deps.EventModel || Event;
  const createStream = deps.createLiveStream || createLiveStream;
  const removeStream = deps.deleteLiveStream || deleteLiveStream;

  const next = { ...payload };
  stripClientSuppliedMuxFields(next);

  if (!shouldProvisionMuxLive(next)) {
    return EventModel.create(next);
  }

  if (!next._id) {
    next._id = new mongoose.Types.ObjectId();
  }

  const liveStream = await createStream({
    eventId: String(next._id),
    slug: next.slug || '',
    title: next.title || '',
  }, deps);
  applyMuxLiveStreamFields(next, liveStream);

  try {
    return await EventModel.create(next);
  } catch (err) {
    try {
      await removeStream(liveStream.liveStreamId, deps);
    } catch {
      /* best-effort rollback only */
    }
    throw err;
  }
}

/** Attach a Mux Live Stream to an existing event that selected Mux but has no ID yet. */
export async function ensureMuxLiveStreamForEvent(event, deps = {}) {
  if (!isMuxEvent(event) || String(event.muxLiveStreamId || '').trim()) {
    return event;
  }
  const liveStream = await (deps.createLiveStream || createLiveStream)({
    eventId: String(event._id || event.id || ''),
    slug: event.slug || '',
    title: event.title || '',
  }, deps);
  applyMuxLiveStreamFields(event, liveStream);
  if (typeof event.save === 'function') await event.save();
  return event;
}

export async function deleteMuxLiveStreamForEvent(event, deps = {}) {
  if (!isMuxEvent(event)) return { deleted: false };
  const id = String(event.muxLiveStreamId || '').trim();
  if (!id) return { deleted: false };
  try {
    await (deps.deleteLiveStream || deleteLiveStream)(id, deps);
    return { deleted: true };
  } catch (err) {
    muxLog('delete live stream failed', {
      liveStreamId: id,
      message: String(err.message || err).slice(0, 180),
    });
    return { deleted: false };
  }
}
