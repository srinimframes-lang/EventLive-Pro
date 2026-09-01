/**
 * Cloudflare Stream Live API — dedicated Live Input per new Server/RTMP event.
 * Never logs or returns RTMPS stream keys in error messages.
 */
import mongoose from 'mongoose';
import { Event } from '../models/Event.js';

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

export function shouldProvisionCloudflareLive(payload = {}) {
  return (
    String(payload.streamProvider || '') === 'rtmp' &&
    String(payload.streamingDestination || '') === 'server'
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

export async function createLiveInput({ eventId, slug, title } = {}, { fetchImpl = fetch, config } = {}) {
  const name = liveInputMetaName({ eventId, slug });
  const result = await cloudflareRequest('/stream/live_inputs', {
    method: 'POST',
    body: {
      meta: { name, eventId: String(eventId || ''), slug: String(slug || ''), title: String(title || '') },
      recording: { mode: 'off' },
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

/** Map Cloudflare Live Input status → publishing (true/false) or unknown (null). */
export function mapLiveInputStatusToPublishing(status) {
  const raw = String(status || '').trim().toLowerCase();
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
    const status = String(result?.status || '').trim();
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

function stripClientSuppliedCloudflareFields(payload) {
  delete payload.liveIngestProvider;
  delete payload.cfStreamLiveInputId;
  delete payload.cfStreamHlsUrl;
  delete payload.cfStreamRtmpsUrl;
  delete payload.cfStreamRtmpsKey;
}

/**
 * Production Event.create wrapper: new Server/RTMP events get a dedicated
 * Cloudflare Live Input. Failure aborts create — no MediaMTX fallback.
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
