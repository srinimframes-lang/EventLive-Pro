/**
 * Cloudflare Stream Live API — dedicated Live Input per new Server/RTMP event.
 * Never logs or returns RTMPS stream keys in error messages.
 */
import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { isCloudflareStreamLive } from '../utils/mediaStream.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15000;
const SECRET_KEY_RE = /token|secret|authorization|key|password/i;

export class CloudflareStreamError extends Error {
  constructor(message, { statusCode = 502, code = 'cloudflare_stream_error' } = {}) {
    super(message);
    this.name = 'CloudflareStreamError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getCloudflareStreamConfig() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(process.env.CLOUDFLARE_STREAM_API_TOKEN || '').trim();
  return {
    accountId,
    apiToken,
    configured: Boolean(accountId && apiToken),
  };
}

const CLOUDFLARE_LIVE_DESTINATIONS = new Set([
  'server',
  'server_youtube',
  'youtube_server',
]);

/**
 * New Server-related events get a dedicated Cloudflare Live Input.
 * YouTube-only stays YouTube. Existing MediaMTX docs are never updated here.
 */
export function shouldProvisionCloudflareLive(payload = {}) {
  const provider = String(payload.streamingProvider || '').trim();
  if (provider === 'external_embed' || provider === 'mux' || provider === 'mediamtx' || provider === 'youtube') {
    return false;
  }
  return (
    String(payload.streamProvider || '') === 'rtmp' &&
    CLOUDFLARE_LIVE_DESTINATIONS.has(String(payload.streamingDestination || ''))
  );
}

export function liveInputMetaName({ eventId, slug = '' } = {}) {
  const id = String(eventId || '').trim();
  const slugPart = String(slug || '')
    .trim()
    .slice(0, 48);
  if (id && slugPart) return `eventlivepro:${id}:${slugPart}`;
  if (id) return `eventlivepro:${id}`;
  return 'eventlivepro:new-event';
}

export function mapLiveInputResult(result) {
  const uid = String(result?.uid || '').trim();
  const rtmpsUrl = String(result?.rtmps?.url || '').trim();
  const rtmpsKey = String(result?.rtmps?.streamKey || '').trim();
  const hlsUrl = String(result?.playback?.hls || '').trim();
  if (!uid || !rtmpsUrl || !rtmpsKey || !hlsUrl) {
    throw new CloudflareStreamError(
      'Cloudflare Live Input response was incomplete',
      { statusCode: 502, code: 'cloudflare_live_input_incomplete' },
    );
  }
  return { uid, rtmpsUrl, rtmpsKey, hlsUrl };
}

export function applyCloudflareLiveInputFields(payload, liveInput) {
  payload.liveIngestProvider = 'cloudflare_stream';
  payload.cfStreamLiveInputId = liveInput.uid;
  payload.cfStreamHlsUrl = liveInput.hlsUrl;
  payload.cfStreamRtmpsUrl = liveInput.rtmpsUrl;
  payload.cfStreamRtmpsKey = liveInput.rtmpsKey;
  if (String(payload.hlsUrl || '').includes('cloudflarestream.com')) {
    payload.hlsUrl = '';
  }
  return payload;
}

function cloudflareLog(step, extra) {
  if (extra === undefined) {
    // eslint-disable-next-line no-console
    console.info(`[cloudflare-stream] ${step}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.info(`[cloudflare-stream] ${step}`, sanitizeLogValue(extra));
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

/** Clone API payloads while dropping token/key/password fields. */
function omitSecretFields(value, depth = 0) {
  if (value == null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitSecretFields(item, depth + 1));
  }
  const out = {};
  Object.entries(value).forEach(([key, val]) => {
    if (SECRET_KEY_RE.test(key)) return;
    out[key] = omitSecretFields(val, depth + 1);
  });
  return out;
}

function describeApiError(json, httpStatus) {
  const first = Array.isArray(json?.errors) ? json.errors[0] : null;
  const code = first?.code;
  const apiMessage = String(first?.message || '').slice(0, 180);
  return {
    httpStatus,
    code,
    message: apiMessage || `Cloudflare Stream request failed (HTTP ${httpStatus})`,
  };
}

async function cloudflareRequest(path, { method = 'GET', body, fetchImpl = fetch, config } = {}) {
  const { accountId, apiToken, configured } = config || getCloudflareStreamConfig();
  if (!configured) {
    throw new CloudflareStreamError(
      'Cloudflare Stream is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN.',
      { statusCode: 503, code: 'cloudflare_not_configured' },
    );
  }

  let res;
  try {
    res = await fetchImpl(`${CF_API_BASE}/accounts/${accountId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CloudflareStreamError(
      `Cloudflare Stream request failed: ${err.message || 'network error'}`,
      { statusCode: 502, code: 'cloudflare_network_error' },
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok || json?.success === false) {
    const info = describeApiError(json, res.status);
    throw new CloudflareStreamError(info.message, {
      statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
      code: info.code != null ? `cloudflare_${info.code}` : 'cloudflare_api_error',
    });
  }

  return json?.result;
}

/** Cloudflare Live Input recordings are kept at least this many days. */
export const CF_RECORDING_RETENTION_DAYS = 30;

/**
 * Seconds Cloudflare waits after disconnect before closing the recording
 * and creating a VOD. `0` waits indefinitely, so no Video UID is ever created.
 */
export const CF_RECORDING_DISCONNECT_TIMEOUT_SECONDS = 30;

/** Live Input create/update recording + retention payload. */
export function cloudflareLiveInputRecordingPayload() {
  return {
    recording: {
      mode: 'automatic',
      timeoutSeconds: CF_RECORDING_DISCONNECT_TIMEOUT_SECONDS,
      requireSignedURLs: false,
    },
    timeoutSeconds: CF_RECORDING_DISCONNECT_TIMEOUT_SECONDS,
    deleteRecordingAfterDays: CF_RECORDING_RETENTION_DAYS,
  };
}

export function liveInputRecordingNeedsEnsure(liveInput = {}) {
  const mode = String(liveInput?.recordingMode || liveInput?.recording?.mode || '')
    .trim()
    .toLowerCase();
  const timeout = Number(
    liveInput?.timeoutSeconds ?? liveInput?.recording?.timeoutSeconds,
  );
  const daysRaw = liveInput?.deleteRecordingAfterDays;
  const days = daysRaw == null || daysRaw === '' ? NaN : Number(daysRaw);
  if (mode !== 'automatic') return true;
  if (!Number.isFinite(timeout) || timeout <= 0) return true;
  if (!Number.isFinite(days) || days < CF_RECORDING_RETENTION_DAYS) return true;
  return false;
}

/** Recording-config slice of a Live Input. Never returns RTMPS keys. */
export async function getLiveInputRecordingConfig(uid, { fetchImpl = fetch, config } = {}) {
  const id = String(uid || '').trim();
  if (!id) {
    throw new CloudflareStreamError('Cloudflare Live Input id is required', {
      statusCode: 400,
      code: 'cloudflare_live_input_id_required',
    });
  }
  const result = await cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(id)}`, {
    fetchImpl,
    config,
  });
  return {
    uid: String(result?.uid || id).trim(),
    recordingMode: String(result?.recording?.mode || '').trim().toLowerCase(),
    timeoutSeconds: Number(result?.recording?.timeoutSeconds ?? result?.timeoutSeconds),
    deleteRecordingAfterDays:
      result?.deleteRecordingAfterDays == null ? null : Number(result.deleteRecordingAfterDays),
  };
}

export async function updateLiveInputRecording(uid, { fetchImpl = fetch, config } = {}) {
  const id = String(uid || '').trim();
  if (!id) {
    throw new CloudflareStreamError('Cloudflare Live Input id is required', {
      statusCode: 400,
      code: 'cloudflare_live_input_id_required',
    });
  }
  await cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: cloudflareLiveInputRecordingPayload(),
    fetchImpl,
    config,
  });
  cloudflareLog('ensured live input recording config', { liveInputUid: id });
  return { updated: true, uid: id };
}

/**
 * Make sure an existing Live Input records automatically and keeps VODs ≥ 30 days.
 * Does not delete the input or rotate ingest keys.
 */
export async function ensureCloudflareLiveInputRecording(uid, deps = {}) {
  const id = String(uid || '').trim();
  if (!id) return { updated: false, reason: 'missing_live_input' };
  const getConfig = deps.getLiveInputRecordingConfig || getLiveInputRecordingConfig;
  const update = deps.updateLiveInputRecording || updateLiveInputRecording;
  let current;
  try {
    current = await getConfig(id, deps);
  } catch (err) {
    cloudflareLog('live input recording config read failed', {
      liveInputUid: id,
      error: err.message || 'unknown',
    });
    return { updated: false, reason: 'read_failed' };
  }
  if (!liveInputRecordingNeedsEnsure(current)) {
    return { updated: false, reason: 'already_configured' };
  }
  try {
    await update(id, deps);
    return { updated: true, uid: id };
  } catch (err) {
    cloudflareLog('live input recording config update failed', {
      liveInputUid: id,
      error: err.message || 'unknown',
    });
    return { updated: false, reason: 'update_failed' };
  }
}

const cfRecordingEnsureDone = new Set();

export async function ensureCloudflareLiveInputRecordingForEvent(event, deps = {}) {
  const uid = String(event?.cfStreamLiveInputId || '').trim();
  if (!uid) return { updated: false, reason: 'missing_live_input' };
  if (cfRecordingEnsureDone.has(uid)) {
    return { updated: false, reason: 'already_ensured' };
  }
  const result = await ensureCloudflareLiveInputRecording(uid, deps);
  if (result?.updated || result?.reason === 'already_configured') {
    cfRecordingEnsureDone.add(uid);
  }
  return result;
}

export async function createLiveInput({ eventId, slug, title } = {}, { fetchImpl = fetch, config } = {}) {
  const name = liveInputMetaName({ eventId, slug });
  const result = await cloudflareRequest('/stream/live_inputs', {
    method: 'POST',
    body: {
      meta: { name, eventId: String(eventId || ''), slug: String(slug || ''), title: String(title || '') },
      ...cloudflareLiveInputRecordingPayload(),
    },
    fetchImpl,
    config,
  });
  const mapped = mapLiveInputResult(result);
  cloudflareLog('created live input', { eventId: String(eventId || ''), uid: mapped.uid });
  return mapped;
}

export async function getLiveInput(uid, { fetchImpl = fetch } = {}) {
  const id = String(uid || '').trim();
  if (!id) {
    throw new CloudflareStreamError('Cloudflare Live Input id is required', {
      statusCode: 400,
      code: 'cloudflare_live_input_id_required',
    });
  }
  const result = await cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(id)}`, {
    fetchImpl,
  });
  return mapLiveInputResult(result);
}

/** Cloudflare videos list may be an array or a wrapped object. */
export function normalizeLiveInputVideosResult(result) {
  if (Array.isArray(result)) return result.filter(Boolean);
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.videos)) return result.videos.filter(Boolean);
  if (Array.isArray(result.result)) return result.result.filter(Boolean);
  if (String(result.uid || '').trim()) return [result];
  return [];
}

export function videoBelongsToLiveInput(video, liveInputId) {
  const id = String(liveInputId || '').trim();
  if (!id || !video || typeof video !== 'object') return false;
  const from = String(
    video.liveInput ||
      video.liveInputUid ||
      video.input?.uid ||
      video.meta?.liveInputUid ||
      '',
  ).trim();
  return from === id;
}

/**
 * List recorded videos for a Live Input.
 * GET /accounts/{account}/stream/live_inputs/{liveInputId}/videos
 * Falls back to GET /stream filtered by liveInput when the scoped list is empty.
 * Returns the Cloudflare result with secret-bearing keys omitted.
 */
export async function listLiveInputVideos(liveInputId, { fetchImpl = fetch, config, liveStartedAt } = {}) {
  const id = String(liveInputId || '').trim();
  if (!id) {
    throw new CloudflareStreamError('Cloudflare Live Input id is required', {
      statusCode: 400,
      code: 'cloudflare_live_input_id_required',
    });
  }
  let videos = [];
  try {
    const result = await cloudflareRequest(
      `/stream/live_inputs/${encodeURIComponent(id)}/videos`,
      { fetchImpl, config },
    );
    videos = normalizeLiveInputVideosResult(result);
  } catch (err) {
    cloudflareLog('live input videos list failed', {
      liveInputUid: id,
      error: err.message || 'unknown',
    });
  }
  if (!videos.length) {
    try {
      const qs = new URLSearchParams();
      const startMs = Date.parse(liveStartedAt);
      if (Number.isFinite(startMs)) {
        qs.set('start', new Date(startMs - 120_000).toISOString());
        qs.set('end', new Date().toISOString());
      }
      const query = qs.toString();
      const listed = await cloudflareRequest(`/stream${query ? `?${query}` : ''}`, {
        fetchImpl,
        config,
      });
      videos = normalizeLiveInputVideosResult(listed).filter((video) =>
        videoBelongsToLiveInput(video, id),
      );
    } catch (err) {
      cloudflareLog('stream videos fallback failed', {
        liveInputUid: id,
        error: err.message || 'unknown',
      });
    }
  }
  const sanitized = omitSecretFields(videos);
  cloudflareLog('listed live input videos', {
    liveInputUid: id,
    count: sanitized.length,
    candidates: sanitized.map((video) =>
      describeCloudflareRecordingCandidate(video, { liveInputId: id }),
    ),
  });
  return sanitized;
}

/**
 * Official Cloudflare Stream Live Input `result.status` values:
 * connected | reconnected | reconnecting | client_disconnect | ttl_exceeded |
 * failed_to_connect | failed_to_reconnect | new_configuration_accepted
 * @see https://developers.cloudflare.com/api/resources/stream/subresources/live_inputs/methods/get/
 */
const LIVE_INPUT_PUBLISHING_STATUSES = new Set(['connected', 'reconnected', 'reconnecting']);
const LIVE_INPUT_OFFLINE_STATUSES = new Set([
  'client_disconnect',
  'ttl_exceeded',
  'failed_to_connect',
  'failed_to_reconnect',
  'new_configuration_accepted',
  'disconnected',
  'offline',
]);

/**
 * Cloudflare Live Input GET returns `status` as:
 *   { current: { state, reason, ... }, history: [] }
 * Older/string payloads are still accepted. Never use String(status) on an object
 * (that becomes "[object Object]" and never matches a real state).
 */
export function extractLiveInputStatusState(status) {
  if (status == null) return '';
  if (typeof status === 'string') return status.trim().toLowerCase();
  if (typeof status !== 'object') return '';
  const nested = status.current?.state ?? status.state;
  if (typeof nested !== 'string') return '';
  return nested.trim().toLowerCase();
}

/** Map Cloudflare Live Input status → publishing (true/false) or unknown (null). */
export function mapLiveInputStatusToPublishing(status) {
  const raw = extractLiveInputStatusState(status);
  if (!raw) return null;
  if (LIVE_INPUT_PUBLISHING_STATUSES.has(raw)) return true;
  if (LIVE_INPUT_OFFLINE_STATUSES.has(raw)) return false;
  return null;
}

/**
 * GET Live Input status only. Never returns RTMPS keys or the raw API result.
 * API/network errors yield isPublishing: null (caller falls back to event.isLive).
 */
export async function getLiveInputStatus(uid, { fetchImpl = fetch, config } = {}) {
  const id = String(uid || '').trim();
  if (!id) {
    return { uid: '', status: '', enabled: null, isPublishing: null };
  }
  try {
    const result = await cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(id)}`, {
      fetchImpl,
      config,
    });
    const status = extractLiveInputStatusState(result?.status);
    const out = {
      uid: String(result?.uid || id).trim(),
      status,
      enabled: typeof result?.enabled === 'boolean' ? result.enabled : null,
      isPublishing: mapLiveInputStatusToPublishing(status),
    };
    cloudflareLog('live input status', {
      uid: out.uid,
      status: out.status,
      isPublishing: out.isPublishing,
    });
    return out;
  } catch {
    cloudflareLog('live input status failed', { uid: id });
    return { uid: id, status: '', enabled: null, isPublishing: null };
  }
}

export async function deleteLiveInput(uid, { fetchImpl = fetch } = {}) {
  const id = String(uid || '').trim();
  if (!id) return false;
  await cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    fetchImpl,
  });
  cloudflareLog('deleted live input', { uid: id });
  return true;
}

/** Pilot / manually attached inputs — never auto-deleted by lifecycle hooks. */
export const PROTECTED_CF_LIVE_INPUT_IDS = new Set([
  'f175154f728840ce4408e98c13c24302',
]);

const COMPLETED_VIDEO_STATES = new Set(['ready']);
const INCOMPLETE_VIDEO_STATES = new Set([
  'pendingupload',
  'downloading',
  'queued',
  'inprogress',
  'error',
  'live-inprogress',
]);

function videoCreatedMs(video) {
  const raw = video?.created || video?.modified || '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function videoDurationSec(video) {
  const d = Number(video?.duration);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** Live Input UID is a live/DVR playlist, never the recorded VOD. */
export function isCloudflareLiveInputVideoUid(uid, liveInputId) {
  const videoUid = String(uid || '').trim();
  const inputId = String(liveInputId || '').trim();
  return Boolean(videoUid && inputId && videoUid === inputId);
}

export function isCloudflareRecordedVodHlsUrl(url, videoUid, liveInputId = '') {
  const uid = String(videoUid || '').trim();
  const inputId = String(liveInputId || '').trim();
  const raw = String(url || '').trim();
  if (!uid || !raw) return false;
  if (isCloudflareLiveInputVideoUid(uid, inputId)) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.searchParams.get('dvrEnabled') === 'true') return false;
    if (!parsed.pathname.includes(uid)) return false;
    if (inputId && parsed.pathname.includes(inputId)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify a Cloudflare HLS body. Master playlists have no ENDLIST;
 * VOD media playlists use PLAYLIST-TYPE:VOD and EXT-X-ENDLIST.
 */
export function classifyCloudflareHlsManifest(text) {
  const body = String(text || '');
  if (!body.includes('#EXTM3U')) {
    return { type: 'invalid', finite: false, hasEndlist: false, isMaster: false };
  }
  const isMaster = /#EXT-X-STREAM-INF/i.test(body);
  const hasEndlist = /#EXT-X-ENDLIST/i.test(body);
  const playlistType = String((body.match(/#EXT-X-PLAYLIST-TYPE:\s*(\w+)/i) || [])[1] || '')
    .trim()
    .toUpperCase();
  if (playlistType === 'VOD' || hasEndlist) {
    return { type: 'vod', finite: true, hasEndlist, isMaster };
  }
  if (playlistType === 'EVENT') {
    return { type: 'event', finite: false, hasEndlist, isMaster };
  }
  if (isMaster) {
    return { type: 'master', finite: null, hasEndlist, isMaster: true };
  }
  return { type: 'live', finite: false, hasEndlist, isMaster: false };
}

export function stripCloudflareLiveDvrParam(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('dvrEnabled');
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw.replace(/([?&])dvrEnabled=[^&#]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
  }
}

export function cloudflareStreamOriginFromUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    const host = parsed.hostname.toLowerCase();
    if (host === 'cloudflarestream.com' || host.endsWith('.cloudflarestream.com')) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Official Stream iframe URL. Origin comes from the stored Live Input HLS host. */
export function buildCloudflareStreamIframeUrl(originOrHlsUrl, uid) {
  const id = String(uid || '').trim();
  const origin = cloudflareStreamOriginFromUrl(originOrHlsUrl);
  if (!id || !origin) return '';
  return `${origin}/${id}/iframe`;
}

/** True when a Live Input video is a completed, playable recording. */
export function isCompletedCloudflareVideo(video) {
  if (!video || typeof video !== 'object') return false;
  if (!String(video.uid || '').trim()) return false;
  if (video.readyToStream === false) return false;
  const state = String(video.status?.state ?? video.status ?? '')
    .trim()
    .toLowerCase();
  if (INCOMPLETE_VIDEO_STATES.has(state)) return false;
  if (COMPLETED_VIDEO_STATES.has(state)) return true;
  return video.readyToStream === true;
}

/**
 * Pick the completed recording from the latest broadcast.
 * Prefers the newest `created` (then `modified`) among ready videos.
 */
function isErrorCloudflareVideo(video) {
  const state = String(video?.status?.state ?? video?.status ?? '')
    .trim()
    .toLowerCase();
  return state === 'error';
}

function pickLatestLiveInputVideo(videos = []) {
  const list = (Array.isArray(videos) ? videos : []).filter((video) => {
    if (!video || typeof video !== 'object') return false;
    if (!String(video.uid || '').trim()) return false;
    return !isErrorCloudflareVideo(video);
  });
  if (!list.length) return null;
  let latest = list[0];
  let latestMs = videoCreatedMs(latest);
  for (let i = 1; i < list.length; i += 1) {
    const ms = videoCreatedMs(list[i]);
    if (ms >= latestMs) {
      latest = list[i];
      latestMs = ms;
    }
  }
  return latest;
}

export function selectLatestCompletedLiveInputVideo(videos = []) {
  return pickLatestLiveInputVideo(
    (Array.isArray(videos) ? videos : []).filter(isCompletedCloudflareVideo),
  );
}

function isLiveInProgressCloudflareVideo(video) {
  const state = String(video?.status?.state ?? video?.status ?? '')
    .trim()
    .toLowerCase();
  return state === 'live-inprogress';
}

const CF_TRAILING_CLIP_MAX_SEC = 45;
/** Cloudflare may finish the VOD a few minutes after EventLive-Pro marks liveEndedAt. */
const CF_VOD_FINALIZE_LAG_MS = 10 * 60 * 1000;
const CF_VOD_ENDED_EARLY_MS = 90 * 1000;

function isProcessingCloudflareVideo(video) {
  return !isCompletedCloudflareVideo(video) || isLiveInProgressCloudflareVideo(video);
}

export function cloudflareVideoPlaybackIsDvr(video) {
  const hls = String(video?.playback?.hls || '').trim();
  if (!hls) return false;
  try {
    return new URL(hls).searchParams.get('dvrEnabled') === 'true';
  } catch {
    return /(?:\?|&)dvrEnabled=true(?:&|$)/i.test(hls);
  }
}

export function describeCloudflareRecordingCandidate(video, { liveInputId } = {}) {
  const uid = String(video?.uid || '').trim();
  return {
    uid,
    durationSec: videoDurationSec(video) || 0,
    createdAt: video?.created || null,
    modifiedAt: video?.modified || null,
    state: String(video?.status?.state ?? video?.status ?? ''),
    readyToStream: video?.readyToStream === true,
    equalsLiveInput: isCloudflareLiveInputVideoUid(uid, liveInputId),
    dvrEnabled: cloudflareVideoPlaybackIsDvr(video),
  };
}

function pickNewestLiveInputVideo(videos = []) {
  const list = (Array.isArray(videos) ? videos : []).filter(
    (video) => video && String(video.uid || '').trim(),
  );
  if (!list.length) return null;
  return list.reduce((best, video) => {
    const vc = videoCreatedMs(video);
    const bc = videoCreatedMs(best);
    if (vc > bc) return video;
    if (bc > vc) return best;
    return video;
  });
}

function impliedRecordingEndMs(video) {
  const created = videoCreatedMs(video);
  const dur = videoDurationSec(video);
  if (created && dur > 0) return created + dur * 1000;
  const modified = Date.parse(video?.modified || '');
  return Number.isFinite(modified) ? modified : created;
}

/**
 * READY finite VOD for the just-ended broadcast.
 * Matches created + duration against liveEndedAt.
 * Does not pick an older test VOD just because it is longest or listed first.
 */
export function readyVodMatchesEndedBroadcast(video, { liveEndedAt } = {}) {
  if (!isCompletedCloudflareVideo(video) || cloudflareVideoPlaybackIsDvr(video)) return false;
  const dur = videoDurationSec(video);
  if (dur > 0 && dur < CF_TRAILING_CLIP_MAX_SEC) return false;
  const endedMs = Date.parse(liveEndedAt);
  const created = videoCreatedMs(video);
  if (!Number.isFinite(endedMs)) {
    return dur >= CF_TRAILING_CLIP_MAX_SEC || dur === 0;
  }
  if (!created || created > endedMs + 60_000) return false;
  if (dur < CF_TRAILING_CLIP_MAX_SEC) return false;
  const gap = endedMs - impliedRecordingEndMs(video);
  return gap >= -CF_VOD_ENDED_EARLY_MS && gap <= CF_VOD_FINALIZE_LAG_MS;
}

function processingMatchesEndedBroadcast(video, { liveEndedAt } = {}) {
  if (!isProcessingCloudflareVideo(video) || cloudflareVideoPlaybackIsDvr(video)) return false;
  const created = videoCreatedMs(video);
  const endedMs = Date.parse(liveEndedAt);
  if (!Number.isFinite(endedMs)) return true;
  if (!created) return true;
  if (created > endedMs + 120_000) return false;
  if (endedMs - created > 8 * 60 * 60 * 1000) return false;
  return true;
}

function pickReadyVodClosestToEndedAt(videos, liveEndedAt) {
  const endedMs = Date.parse(liveEndedAt);
  if (!Number.isFinite(endedMs)) return pickNewestLiveInputVideo(videos);
  return videos.reduce((best, video) => {
    const bestGap = Math.abs(impliedRecordingEndMs(best) - endedMs);
    const videoGap = Math.abs(impliedRecordingEndMs(video) - endedMs);
    return videoGap < bestGap ? video : best;
  });
}

/**
 * Exact recording for the just-ended broadcast.
 * Never uses the Live Input UID or a dvrEnabled=true playlist.
 * Never prefers a 10–30s trailing clip or an older test VOD.
 * A READY session VOD wins over a leftover live-inprogress object.
 */
export function selectBroadcastRecordingVideo(
  videos = [],
  { liveStartedAt, liveEndedAt, liveInputId } = {},
) {
  const inputId = String(liveInputId || '').trim();
  const all = (Array.isArray(videos) ? videos : []).filter((video) => {
    if (!video || typeof video !== 'object') return false;
    const uid = String(video.uid || '').trim();
    if (!uid) return false;
    if (isCloudflareLiveInputVideoUid(uid, inputId)) return false;
    if (isErrorCloudflareVideo(video)) return false;
    if (cloudflareVideoPlaybackIsDvr(video)) return false;
    return true;
  });
  if (!all.length) return null;

  const selected = (video, ready) => ({
    video,
    uid: String(video.uid || '').trim(),
    ready,
    durationSec: videoDurationSec(video),
  });

  const session = { liveStartedAt, liveEndedAt, liveInputId: inputId };
  const endedMs = Date.parse(liveEndedAt);

  if (!Number.isFinite(endedMs)) {
    const newest = pickNewestLiveInputVideo(all);
    if (newest && isProcessingCloudflareVideo(newest)) {
      return selected(newest, false);
    }
    const ready = all.filter((video) => readyVodMatchesEndedBroadcast(video, session));
    if (ready.length) return selected(pickNewestLiveInputVideo(ready), true);
    if (newest) return selected(newest, false);
    return null;
  }

  const matchingReady = all.filter((video) => readyVodMatchesEndedBroadcast(video, session));
  if (matchingReady.length) {
    return selected(pickReadyVodClosestToEndedAt(matchingReady, liveEndedAt), true);
  }

  const matchingProcessing = all.filter((video) => processingMatchesEndedBroadcast(video, session));
  if (matchingProcessing.length) {
    return selected(pickNewestLiveInputVideo(matchingProcessing), false);
  }

  const sessionReady = all.filter((video) => {
    if (!isCompletedCloudflareVideo(video)) return false;
    const dur = videoDurationSec(video);
    if (dur > 0 && dur < CF_TRAILING_CLIP_MAX_SEC) return false;
    const created = videoCreatedMs(video);
    const started = Date.parse(liveStartedAt);
    if (Number.isFinite(started) && created && created < started - 120_000) return false;
    return true;
  });
  if (sessionReady.length) {
    return selected(pickReadyVodClosestToEndedAt(sessionReady, liveEndedAt), true);
  }

  const newest = pickNewestLiveInputVideo(all);
  if (newest && videoDurationSec(newest) > 0 && videoDurationSec(newest) < CF_TRAILING_CLIP_MAX_SEC) {
    return selected(newest, false);
  }

  return null;
}

/**
 * True when the stored Video UID belongs to a previous broadcast.
 * An old UID must not be served or treated as this session's recording.
 */
export function isStaleCloudflareRecordedUid(event) {
  const uid = String(event?.cfStreamVideoUid || '').trim();
  if (!uid) return false;
  const started = Date.parse(event?.liveStartedAt);
  const captured = Date.parse(event?.cfStreamVideoCapturedAt);
  if (!Number.isFinite(started) || !Number.isFinite(captured)) return false;
  return captured < started;
}

export function isIncompleteSavedCloudflareVod(event) {
  const uid = String(event?.cfStreamVideoUid || '').trim();
  const inputId = String(event?.cfStreamLiveInputId || '').trim();
  if (!uid) return false;
  if (isCloudflareLiveInputVideoUid(uid, inputId)) return true;
  const saved = Number(event?.cfStreamVideoDurationSec);
  if (!Number.isFinite(saved) || saved <= 0) return false;
  return saved < CF_TRAILING_CLIP_MAX_SEC;
}

export function needsCloudflareRecordingUid(event) {
  if (!isCloudflareStreamLive(event)) return false;
  if (String(event?.cfStreamPendingVideoUid || '').trim()) return true;
  if (!String(event?.cfStreamVideoUid || '').trim()) return true;
  if (isStaleCloudflareRecordedUid(event)) return true;
  return isIncompleteSavedCloudflareVod(event);
}

/**
 * Start of a new Cloudflare broadcast (not an in-grace reconnect).
 * Clears the previous VOD UID so it cannot be reused for this session.
 */
export function beginCloudflareLiveBroadcast(event, { now = new Date() } = {}) {
  const wasReconnecting = Boolean(event?.liveReconnecting);
  const wasLive = Boolean(event?.isLive) && event?.status === 'live';
  const endedAtSet = Boolean(event?.liveEndedAt);
  if (wasLive && !wasReconnecting && !endedAtSet) {
    return { started: false, newSession: false, event };
  }

  const newSession = !wasLive || endedAtSet;
  event.isLive = true;
  event.liveReconnecting = false;
  event.liveReconnectUntil = undefined;
  event.liveEndedAt = undefined;
  if (['draft', 'published', 'ended'].includes(event.status)) event.status = 'live';
  if (newSession) {
    event.liveStartedAt = now;
    event.cfStreamVideoUid = '';
    event.cfStreamPendingVideoUid = '';
    event.cfStreamVideoCapturedAt = undefined;
    event.cfStreamVideoDurationSec = undefined;
    event.cfStreamPlaybackHlsUrl = '';
  } else {
    event.liveStartedAt = event.liveStartedAt || now;
  }
  return { started: true, newSession, event };
}

/**
 * After a Cloudflare live goes offline, persist the recorded Stream video UID.
 * Does not change Live Input recording configuration.
 * Does not set MediaMTX/R2 recording fields (not "recorded" until a VOD UID exists).
 */
export async function captureCloudflareRecordedVideoUid(event, deps = {}) {
  if (!isCloudflareStreamLive(event)) {
    return { saved: false, reason: 'not_cloudflare' };
  }
  const liveInputId = String(event.cfStreamLiveInputId || '').trim();
  if (!liveInputId) return { saved: false, reason: 'missing_live_input' };

  const listVideos = deps.listLiveInputVideos || listLiveInputVideos;
  let videos;
  try {
    videos = await listVideos(liveInputId, {
      liveStartedAt: event.liveStartedAt,
      liveEndedAt: event.liveEndedAt,
    });
  } catch (err) {
    cloudflareLog('list live input videos failed', {
      liveInputUid: liveInputId,
      liveStartedAt: event.liveStartedAt || null,
      liveEndedAt: event.liveEndedAt || null,
      error: err.message || 'unknown',
    });
    return { saved: false, reason: 'list_failed' };
  }

  if (!videos.length) {
    try {
      videos = await listVideos(liveInputId, {
        liveStartedAt: event.liveStartedAt,
        liveEndedAt: event.liveEndedAt,
      });
    } catch {
      videos = [];
    }
  }

  const selected = selectBroadcastRecordingVideo(videos, {
    liveStartedAt: event.liveStartedAt,
    liveEndedAt: event.liveEndedAt,
    liveInputId,
  });
  const uid = String(selected?.uid || '').trim();
  const officialHls = stripCloudflareLiveDvrParam(selected?.video?.playback?.hls || '');
  const playbackHlsUrl = isCloudflareRecordedVodHlsUrl(officialHls, uid, liveInputId)
    ? officialHls
    : '';

  const logDiscovery = (extra = {}) => {
    cloudflareLog('vod discovery', {
      eventId: String(event.id || event._id || ''),
      liveInputUid: liveInputId,
      liveStartedAt: event.liveStartedAt || null,
      liveEndedAt: event.liveEndedAt || null,
      candidates: (Array.isArray(videos) ? videos : []).map((video) =>
        describeCloudflareRecordingCandidate(video, { liveInputId }),
      ),
      selectedUid: uid,
      selectedDurationSec: selected?.durationSec || 0,
      selectedCreatedAt: selected?.video?.created || null,
      selectedState: String(selected?.video?.status?.state || selected?.video?.status || ''),
      selectedReady: Boolean(selected?.ready),
      persistedCfStreamVideoUid: extra.persistedCfStreamVideoUid || '',
      playbackHlsUrl: extra.playbackHlsUrl || '',
      ...extra,
    });
  };

  if (!uid || isCloudflareLiveInputVideoUid(uid, liveInputId)) {
    logDiscovery({ reason: 'no_completed_video', persistedCfStreamVideoUid: '', playbackHlsUrl: '' });
    return { saved: false, reason: 'no_completed_video' };
  }
  if (!selected.ready) {
    event.cfStreamPendingVideoUid = uid;
    if (isStaleCloudflareRecordedUid(event) || isIncompleteSavedCloudflareVod(event)) {
      event.cfStreamVideoUid = '';
      event.cfStreamVideoCapturedAt = undefined;
      event.cfStreamVideoDurationSec = undefined;
      event.cfStreamPlaybackHlsUrl = '';
    }
    logDiscovery({
      reason: 'processing',
      persistedCfStreamVideoUid: String(event.cfStreamVideoUid || '').trim(),
      playbackHlsUrl: '',
    });
    return { saved: false, reason: 'processing', uid };
  }

  event.cfStreamVideoUid = uid;
  event.cfStreamPendingVideoUid = '';
  event.cfStreamVideoCapturedAt = new Date();
  event.cfStreamVideoDurationSec = selected.durationSec || undefined;
  event.cfStreamPlaybackHlsUrl = playbackHlsUrl;
  logDiscovery({
    reason: 'captured',
    persistedCfStreamVideoUid: uid,
    playbackHlsUrl: playbackHlsUrl || resolveCloudflareRecordedPlaybackUrl(event),
  });
  return { saved: true, uid, durationSec: selected.durationSec || 0 };
}

/**
 * Build Cloudflare Stream VOD HLS from the live manifest hostname,
 * replacing the Live Input UID with the recorded video UID.
 */
export function resolveCloudflareRecordedPlaybackUrl(event) {
  const videoUid = String(event?.cfStreamVideoUid || '').trim();
  const inputId = String(event?.cfStreamLiveInputId || '').trim();
  if (!videoUid || isCloudflareLiveInputVideoUid(videoUid, inputId)) return '';
  const official = stripCloudflareLiveDvrParam(event?.cfStreamPlaybackHlsUrl || '');
  if (isCloudflareRecordedVodHlsUrl(official, videoUid, inputId)) return official;
  return buildCloudflareRecordedHlsUrl(event?.cfStreamHlsUrl, videoUid, inputId);
}

export function buildCloudflareRecordedHlsUrl(cfStreamHlsUrl, cfStreamVideoUid, liveInputId = '') {
  const videoUid = String(cfStreamVideoUid || '').trim();
  const inputId = String(liveInputId || '').trim();
  const liveUrl = String(cfStreamHlsUrl || '').trim();
  if (!videoUid || !liveUrl) return '';
  if (isCloudflareLiveInputVideoUid(videoUid, inputId)) return '';
  try {
    const parsed = new URL(liveUrl);
    if (inputId && parsed.pathname.includes(inputId)) {
      parsed.pathname = parsed.pathname.split(inputId).join(videoUid);
    } else {
      parsed.pathname = parsed.pathname.replace(/\/[^/]+(?=\/manifest\/)/, `/${videoUid}`);
    }
    parsed.search = '';
    parsed.hash = '';
    const out = parsed.toString();
    if (!isCloudflareRecordedVodHlsUrl(out, videoUid, inputId)) return '';
    return out;
  } catch {
    return '';
  }
}

/**
 * Public recorded-playback fields for an offline Cloudflare event with a VOD UID.
 * Returns null when live, MediaMTX, or no completed video UID — caller keeps existing URLs.
 */
export function cloudflareRecordedPlaybackFields(event, { isLive = false } = {}) {
  if (isLive || !isCloudflareStreamLive(event)) return null;
  const hlsUrl = resolveCloudflareRecordedPlaybackUrl(event);
  if (!hlsUrl) return null;
  const videoUid = String(event.cfStreamVideoUid || '').trim();
  return {
    playbackMode: 'recorded',
    recordingAvailable: true,
    hlsUrl,
    playbackUrl: hlsUrl,
    playerUrl: buildCloudflareStreamIframeUrl(event.cfStreamHlsUrl || hlsUrl, videoUid),
    recordingUrl: '',
    cfStreamVideoUid: videoUid,
    durationSec: Number(event.cfStreamVideoDurationSec) || 0,
  };
}

/**
 * Public watch-page playback for a Cloudflare event.
 * UID present → recorded HLS. Offline without UID → preparing, not live-wait.
 */
export function publicCloudflareOfflinePlayback(event, { isLive = false } = {}) {
  if (!isCloudflareStreamLive(event)) return null;
  if (isLive) return null;
  if (
    !isStaleCloudflareRecordedUid(event) &&
    !isIncompleteSavedCloudflareVod(event)
  ) {
    const recorded = cloudflareRecordedPlaybackFields(event, { isLive: false });
    if (recorded) {
      cloudflareLog('offline playback uses recorded vod', {
        eventId: String(event.id || event._id || ''),
        videoUid: recorded.cfStreamVideoUid || '',
        uidEqualsLiveInput: isCloudflareLiveInputVideoUid(
          recorded.cfStreamVideoUid,
          event.cfStreamLiveInputId,
        ),
        durationSec: recorded.durationSec || 0,
        playbackUrlType: 'finite_vod',
      });
      return {
        ...recorded,
        recordingUrl: '',
        cfRecordingPreparing: false,
      };
    }
  }
  return {
    playbackMode: 'offline',
    recordingAvailable: false,
    recordingUrl: '',
    hlsUrl: '',
    playbackUrl: '',
    cfRecordingPreparing: true,
  };
}

/** Extra video-list attempts after the immediate capture in finalizeEventOffline. */
export const CF_RECORDING_UID_RETRY_DELAYS_MS = [
  5_000,
  8_000,
  12_000,
  20_000,
  30_000,
  45_000,
  60_000,
  90_000,
  120_000,
  180_000,
  300_000,
];

/** Minimum gap between GET /stream reconcile video-list calls for the same event. */
export const CF_UID_RECONCILE_MIN_INTERVAL_MS = 5_000;

const cfOfflineFinalizeStarted = new Set();
const cfRecordingRetryTimers = new Map();
const cfUidReconcileLastAttemptMs = new Map();

function eventIdOf(event) {
  return String(event?._id || event?.id || '').trim();
}

/**
 * Watch-page polling plan for Cloudflare ingest.
 * Protected Live Inputs still capture VOD UIDs; they are only skipped for DELETE.
 */
export function planCloudflareStreamConfigOffline(event, isPublishing) {
  if (!isCloudflareStreamLive(event)) return { action: 'none' };
  if (isPublishing === true) return { action: 'persist_live' };
  const liveish = Boolean(event.isLive) || event.status === 'live';
  if (isPublishing === false && liveish) {
    return { action: 'finalize_once' };
  }
  if (
    isPublishing == null &&
    (event.status === 'ended' || event.status === 'cancelled') &&
    needsCloudflareRecordingUid(event)
  ) {
    return { action: 'reconcile_uid' };
  }
  if (liveish) return { action: 'none' };
  if (needsCloudflareRecordingUid(event)) return { action: 'reconcile_uid' };
  return { action: 'none' };
}

export function shouldReconcileCloudflareRecordingUid(eventId, deps = {}) {
  const id = String(eventId || '').trim();
  if (!id) return false;
  if (cfRecordingRetryTimers.has(id)) return false;
  const now = Number.isFinite(Number(deps.now)) ? Number(deps.now) : Date.now();
  const minInterval = Number(deps.minIntervalMs) > 0
    ? Number(deps.minIntervalMs)
    : CF_UID_RECONCILE_MIN_INTERVAL_MS;
  const last = cfUidReconcileLastAttemptMs.get(id) || 0;
  return !last || now - last >= minInterval;
}

export function markCloudflareRecordingUidReconcileAttempt(eventId, deps = {}) {
  const id = String(eventId || '').trim();
  if (!id) return;
  const now = Number.isFinite(Number(deps.now)) ? Number(deps.now) : Date.now();
  cfUidReconcileLastAttemptMs.set(id, now);
}

export function clearCloudflareRecordingUidReconcileState(eventId) {
  const id = String(eventId || '').trim();
  if (id) cfUidReconcileLastAttemptMs.delete(id);
}

export function beginCloudflareOfflineFinalization(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return false;
  if (cfOfflineFinalizeStarted.has(id)) return false;
  cfOfflineFinalizeStarted.add(id);
  return true;
}

export function clearCloudflareOfflineFinalization(eventId) {
  const id = String(eventId || '').trim();
  if (id) cfOfflineFinalizeStarted.delete(id);
}

export function cancelCloudflareRecordingUidRetry(eventId) {
  const id = String(eventId || '').trim();
  const row = cfRecordingRetryTimers.get(id);
  if (!row) return false;
  try {
    row.clearTimeoutFn(row.timer);
  } catch {
    /* ignore */
  }
  cfRecordingRetryTimers.delete(id);
  return true;
}

export function resetCloudflareOfflineFinalizationState() {
  for (const id of [...cfRecordingRetryTimers.keys()]) {
    cancelCloudflareRecordingUidRetry(id);
  }
  cfOfflineFinalizeStarted.clear();
  cfUidReconcileLastAttemptMs.clear();
  cfRecordingEnsureDone.clear();
}

export function isCloudflareRecordingUidRetryInflight(eventId) {
  return cfRecordingRetryTimers.has(String(eventId || '').trim());
}

/**
 * Background retries for Cloudflare VOD UID. Does not block the HTTP request.
 * Duplicate schedule calls for the same event are ignored.
 */
export function scheduleCloudflareRecordingUidRetry(eventId, deps = {}) {
  const id = String(eventId || '').trim();
  if (!id) return { scheduled: false, reason: 'no_event' };
  if (cfRecordingRetryTimers.has(id)) return { scheduled: false, reason: 'already_inflight' };

  const delays = Array.isArray(deps.delaysMs) && deps.delaysMs.length
    ? deps.delaysMs
    : CF_RECORDING_UID_RETRY_DELAYS_MS;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn || clearTimeout;
  const EventModel = deps.EventModel || Event;
  const capture = deps.captureCloudflareRecordedVideoUid || captureCloudflareRecordedVideoUid;

  let attempt = 0;
  const finish = () => {
    const row = cfRecordingRetryTimers.get(id);
    if (row) {
      try {
        row.clearTimeoutFn(row.timer);
      } catch {
        /* ignore */
      }
    }
    cfRecordingRetryTimers.delete(id);
  };

  const tick = async () => {
    try {
      const event = await EventModel.findById(id);
      if (!event || !isCloudflareStreamLive(event)) {
        finish();
        return;
      }
      if (String(event.cfStreamVideoUid || '').trim() && !needsCloudflareRecordingUid(event)) {
        finish();
        return;
      }
      const result = await capture(event, deps);
      if (result?.saved && String(event.cfStreamVideoUid || '').trim()) {
        if (typeof event.save === 'function') await event.save();
        finish();
        return;
      }
      if (result?.reason === 'processing' && typeof event.save === 'function') {
        await event.save();
      }
    } catch {
      /* keep retrying until delays are exhausted */
    }
    attempt += 1;
    if (attempt >= delays.length) {
      finish();
      return;
    }
    const timer = setTimeoutFn(() => tick(), delays[attempt]);
    cfRecordingRetryTimers.set(id, { timer, clearTimeoutFn });
  };

  const timer = setTimeoutFn(() => tick(), delays[0]);
  cfRecordingRetryTimers.set(id, { timer, clearTimeoutFn });
  return { scheduled: true, attempts: delays.length };
}

async function reconcileCloudflareRecordingUid(event, deps = {}) {
  const id = eventIdOf(event);
  if (String(event?.cfStreamVideoUid || '').trim() && !needsCloudflareRecordingUid(event)) {
    return { action: 'none', event };
  }
  if (isCloudflareRecordingUidRetryInflight(id)) {
    return { action: 'skipped_duplicate', event };
  }
  if (!shouldReconcileCloudflareRecordingUid(id, deps)) {
    return { action: 'skipped_backoff', event };
  }
  markCloudflareRecordingUidReconcileAttempt(id, deps);

  const capture = deps.captureCloudflareRecordedVideoUid || captureCloudflareRecordedVideoUid;
  try {
    const result = await capture(event, deps);
    if (result?.saved && String(event.cfStreamVideoUid || '').trim()) {
      if (typeof event.save === 'function') await event.save();
      return { action: 'reconcile_uid', event };
    }
    if (result?.reason === 'processing' && typeof event.save === 'function') {
      await event.save();
    }
  } catch {
    /* keep retrying in the background */
  }
  scheduleCloudflareRecordingUidRetry(id, deps);
  return { action: 'reconcile_uid', event };
}

/**
 * Apply Cloudflare live/offline transition from a stream-config poll.
 * Finalization runs at most once per live session; VOD retries are async.
 * Ended events missing a UID are reconciled with backoff (missed transition).
 */
export async function syncCloudflareLiveOfflineTransition(event, isPublishing, deps = {}) {
  const plan = planCloudflareStreamConfigOffline(event, isPublishing);
  const id = eventIdOf(event);
  if (plan.action === 'persist_live') {
    clearCloudflareOfflineFinalization(id);
    cancelCloudflareRecordingUidRetry(id);
    clearCloudflareRecordingUidReconcileState(id);
    const persist = deps.persistCloudflareLive;
    let next = event;
    if (typeof persist === 'function') {
      next = await persist(event);
    } else {
      beginCloudflareLiveBroadcast(event);
      next = event;
    }
    return { action: 'persist_live', event: next };
  }
  if (plan.action === 'reconcile_uid') {
    return reconcileCloudflareRecordingUid(event, deps);
  }
  if (plan.action !== 'finalize_once') {
    return { action: 'none', event };
  }
  if (!beginCloudflareOfflineFinalization(id)) {
    return { action: 'skipped_duplicate', event };
  }
  const finalize = deps.finalizeEventOffline;
  let next = event;
  if (typeof finalize === 'function') {
    next = (await finalize(id, { io: deps.io })) || event;
  }
  if (!String(next?.cfStreamVideoUid || '').trim() || needsCloudflareRecordingUid(next)) {
    scheduleCloudflareRecordingUidRetry(id, deps);
  }
  return { action: 'finalize_once', event: next };
}

/**
 * Durable fallback: find offline Cloudflare events still missing a current VOD UID.
 * Independent of in-memory retry timers and of whether a viewer is polling GET /stream.
 */
export async function reconcileOfflineCloudflareRecordings(deps = {}) {
  const EventModel = deps.EventModel || Event;
  const capture = deps.captureCloudflareRecordedVideoUid || captureCloudflareRecordedVideoUid;
  const limit = Number(deps.limit) > 0 ? Number(deps.limit) : 25;
  let events = [];
  try {
    if (typeof deps.findEvents === 'function') {
      events = await deps.findEvents();
    } else {
      const query = EventModel.find({
        liveIngestProvider: 'cloudflare_stream',
        isLive: { $ne: true },
        status: { $ne: 'live' },
      });
      events = typeof query?.limit === 'function' ? await query.limit(limit) : await query;
    }
  } catch (err) {
    cloudflareLog('offline recording reconcile query failed', {
      error: err.message || 'unknown',
    });
    return { scanned: 0, saved: 0, pending: 0 };
  }

  const list = Array.isArray(events) ? events : [];
  let saved = 0;
  let pending = 0;
  for (const event of list) {
    if (!needsCloudflareRecordingUid(event)) continue;
    try {
      const result = await capture(event, deps);
      if (result?.saved) {
        saved += 1;
        if (typeof event.save === 'function') await event.save();
      } else if (result?.reason === 'processing') {
        pending += 1;
        if (typeof event.save === 'function') await event.save();
      }
    } catch (err) {
      cloudflareLog('offline recording reconcile failed', {
        eventId: eventIdOf(event),
        error: err.message || 'unknown',
      });
    }
  }
  cloudflareLog('offline recording reconcile', {
    scanned: list.length,
    saved,
    pending,
  });
  return { scanned: list.length, saved, pending };
}

/**
 * True when this app may DELETE the Live Input after the Event is removed.
 * Requires exclusive ownership and a non-protected uid.
 */
export function shouldDeleteCloudflareLiveInputForEvent(event, { otherEventsUsingInput = 0 } = {}) {
  if (!event || String(event.liveIngestProvider || '') !== 'cloudflare_stream') return false;
  const uid = String(event.cfStreamLiveInputId || '').trim();
  if (!uid) return false;
  if (PROTECTED_CF_LIVE_INPUT_IDS.has(uid)) return false;
  if (otherEventsUsingInput > 0) return false;
  return true;
}

/**
 * Best-effort delete of a dedicated Live Input when its Event is removed.
 * Never deletes protected or shared inputs.
 */
export async function deleteCloudflareLiveInputForEvent(event, deps = {}) {
  const EventModel = deps.EventModel || Event;
  const removeInput = deps.deleteLiveInput || deleteLiveInput;
  const uid = String(event?.cfStreamLiveInputId || '').trim();
  if (!uid) return { deleted: false, reason: 'no_live_input' };

  const otherEventsUsingInput = await EventModel.countDocuments({
    _id: { $ne: event._id },
    cfStreamLiveInputId: uid,
  });

  if (!shouldDeleteCloudflareLiveInputForEvent(event, { otherEventsUsingInput })) {
    return {
      deleted: false,
      reason: PROTECTED_CF_LIVE_INPUT_IDS.has(uid)
        ? 'protected_live_input'
        : otherEventsUsingInput > 0
          ? 'shared_live_input'
          : 'not_cloudflare_event',
    };
  }

  try {
    await removeInput(uid);
    return { deleted: true, uid };
  } catch (err) {
    cloudflareLog('delete live input failed', { uid, error: err.message || 'unknown' });
    return { deleted: false, reason: 'cloudflare_delete_failed', uid };
  }
}

function splitRtmpTarget(target) {
  const value = String(target || '').trim();
  if (!value) return null;
  const slash = value.lastIndexOf('/');
  if (slash <= value.indexOf('://') + 2) return null;
  return {
    url: value.slice(0, slash + 1).replace(/\/+$/, '/'),
    streamKey: value.slice(slash + 1),
  };
}

/** List simulcast outputs for a Live Input (no stream keys in return beyond API). */
export async function listLiveInputOutputs(liveInputUid, { fetchImpl = fetch } = {}) {
  const id = String(liveInputUid || '').trim();
  if (!id) return [];
  const result = await cloudflareRequest(
    `/stream/live_inputs/${encodeURIComponent(id)}/outputs`,
    { fetchImpl },
  );
  return Array.isArray(result) ? result : [];
}

/** Create a simulcast output on a Live Input (YouTube / Facebook RTMPS). */
export async function createLiveInputOutput(
  liveInputUid,
  { url, streamKey, enabled = true } = {},
  { fetchImpl = fetch } = {},
) {
  const id = String(liveInputUid || '').trim();
  const outUrl = String(url || '').trim();
  const outKey = String(streamKey || '').trim();
  if (!id || !outUrl || !outKey) {
    throw new CloudflareStreamError('Simulcast output requires url and streamKey', {
      statusCode: 400,
      code: 'cloudflare_output_incomplete',
    });
  }
  return cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(id)}/outputs`, {
    method: 'POST',
    body: { url: outUrl, streamKey: outKey, enabled: Boolean(enabled) },
    fetchImpl,
  });
}

export async function deleteLiveInputOutput(liveInputUid, outputUid, { fetchImpl = fetch } = {}) {
  const inputId = String(liveInputUid || '').trim();
  const outId = String(outputUid || '').trim();
  if (!inputId || !outId) return false;
  await cloudflareRequest(
    `/stream/live_inputs/${encodeURIComponent(inputId)}/outputs/${encodeURIComponent(outId)}`,
    { method: 'DELETE', fetchImpl },
  );
  return true;
}

/**
 * Sync Cloudflare simulcast outputs for a Cloudflare Stream event.
 * MediaMTX ffmpeg forward is skipped for cloudflare_stream events.
 */
export async function syncCloudflareSimulcastOutputs(event, deps = {}) {
  if (!isCloudflareStreamLive(event)) return { synced: false, reason: 'not_cloudflare' };
  const liveInputUid = String(event.cfStreamLiveInputId || '').trim();
  if (!liveInputUid) return { synced: false, reason: 'missing_live_input' };
  if (PROTECTED_CF_LIVE_INPUT_IDS.has(liveInputUid)) {
    return { synced: false, reason: 'protected_live_input' };
  }

  const listOutputs = deps.listLiveInputOutputs || listLiveInputOutputs;
  const createOutput = deps.createLiveInputOutput || createLiveInputOutput;
  const deleteOutput = deps.deleteLiveInputOutput || deleteLiveInputOutput;
  const { buildForwardTarget, DEFAULT_FACEBOOK_RTMP } = await import('../utils/streamForward.js');

  const desired = [];
  // Never attach YouTube as a Cloudflare Live Input Output: that copies original
  // ingest audio. YouTube video-only restream is handled by the CF HLS worker.
  if (event.facebookForwardEnabled) {
    const target = buildForwardTarget(event.facebookRtmpUrl, event.facebookStreamKey, {
      fallbackUrl: DEFAULT_FACEBOOK_RTMP,
    });
    const parts = splitRtmpTarget(target);
    if (parts) desired.push({ id: 'facebook', ...parts, enabled: true });
  }

  const existing = await listOutputs(liveInputUid);
  const created = [];
  for (const spec of desired) {
    const match = existing.find(
      (o) => String(o.url || '').replace(/\/+$/, '/') === spec.url.replace(/\/+$/, '/'),
    );
    if (!match) {
      // eslint-disable-next-line no-await-in-loop
      const out = await createOutput(liveInputUid, spec);
      created.push(String(out?.uid || ''));
    }
  }

  for (const out of existing) {
    const stillWanted = desired.some(
      (d) => String(out.url || '').replace(/\/+$/, '/') === d.url.replace(/\/+$/, '/'),
    );
    if (!stillWanted && out.uid) {
      // eslint-disable-next-line no-await-in-loop
      await deleteOutput(liveInputUid, out.uid);
    }
  }

  cloudflareLog('simulcast outputs synced', {
    eventId: String(event._id || event.id || ''),
    liveInputUid,
    desiredCount: desired.length,
    createdCount: created.length,
  });
  return { synced: true, desiredCount: desired.length, createdCount: created.length };
}

function stripClientSuppliedCloudflareFields(payload) {
  delete payload.liveIngestProvider;
  delete payload.cfStreamLiveInputId;
  delete payload.cfStreamHlsUrl;
  delete payload.cfStreamRtmpsUrl;
  delete payload.cfStreamRtmpsKey;
}

/**
 * Production Event.create wrapper: new Server / Server+YouTube /
 * YouTube+Server events get a dedicated Cloudflare Live Input.
 * Failure aborts create — no MediaMTX fallback. Existing MediaMTX
 * documents are never passed through this path.
 */
export async function createEventWithCloudflareLive(payload, deps = {}) {
  const EventModel = deps.EventModel || Event;
  const createInput = deps.createLiveInput || createLiveInput;
  const removeInput = deps.deleteLiveInput || deleteLiveInput;

  const next = { ...payload };
  stripClientSuppliedCloudflareFields(next);

  if (!shouldProvisionCloudflareLive(next)) {
    return EventModel.create(next);
  }

  if (!next._id) {
    next._id = new mongoose.Types.ObjectId();
  }

  const liveInput = await createInput({
    eventId: String(next._id),
    slug: next.slug || '',
    title: next.title || '',
  });
  applyCloudflareLiveInputFields(next, liveInput);

  try {
    return await EventModel.create(next);
  } catch (err) {
    try {
      await removeInput(liveInput.uid);
    } catch {
      /* best-effort rollback only */
    }
    throw err;
  }
}
