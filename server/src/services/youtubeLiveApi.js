/**
 * Reusable YouTube Data / Live Streaming API helpers.
 * OAuth connect does NOT create broadcasts by itself — event create calls
 * createBoundYoutubeLive() when YouTube is selected and no manual URL was pasted.
 */
import { env } from '../config/env.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  loadUserCredential,
  applyRefreshedTokens,
} from '../utils/youtubeOauth.js';
import { decryptYoutubeToken } from '../utils/youtubeTokenCrypto.js';
import { getYoutubeGoogleAdapter } from '../utils/youtubeGoogle.js';

const SECRET_KEY_RE = /token|secret|authorization|cookie|password/i;
const SECRET_VALUE_RE = /ya29\.[A-Za-z0-9._~-]+|1\/\/[A-Za-z0-9._~-]+|access_token|refresh_token|client_secret/gi;

function youtubeSafeText(value) {
  return String(value || '').replace(SECRET_VALUE_RE, '[redacted]');
}

function sanitizeYoutubeLogValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return youtubeSafeText(value);
  if (typeof value !== 'object' || depth > 4) return youtubeSafeText(String(value));
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeYoutubeLogValue(item, depth + 1));
  const out = {};
  Object.entries(value).forEach(([key, val]) => {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = val ? true : false;
      return;
    }
    out[key] = sanitizeYoutubeLogValue(val, depth + 1);
  });
  return out;
}

/** Safe server log. Never writes access/refresh tokens. */
export function youtubeLog(step, extra) {
  const prefix = `[YouTube] ${step}`;
  if (extra === undefined) {
    // eslint-disable-next-line no-console
    console.info(prefix);
    return;
  }
  // eslint-disable-next-line no-console
  console.info(prefix, sanitizeYoutubeLogValue(extra));
}

/**
 * Extract the real YouTube / Google API error without secrets.
 * googleapis may put details on err.errors[], err.response.data.error, or err.message.
 */
export function describeYoutubeApiError(err) {
  if (!err) {
    return { status: 502, reason: 'unknown', message: 'YouTube API request failed', step: '' };
  }
  const data = err.response?.data?.error || {};
  const first = Array.isArray(err.errors) ? err.errors[0] : Array.isArray(data.errors) ? data.errors[0] : null;
  const reason = youtubeSafeText(
    first?.reason ||
      data.status ||
      data.reason ||
      err.youtubeReason ||
      (typeof err.code === 'string' ? err.code : '') ||
      ''
  );
  const message = youtubeSafeText(
    first?.message || data.message || err.message || 'YouTube API request failed'
  );
  const numeric =
    Number(err.statusCode) ||
    Number(err.response?.status) ||
    (typeof err.code === 'number' ? err.code : 0) ||
    Number(data.code) ||
    502;
  const status = numeric >= 400 && numeric < 600 ? numeric : 502;
  return {
    status,
    reason: String(reason === 'youtube_api_error' ? '' : reason),
    message,
    step: err.youtubeStep || '',
  };
}

export function wrapYoutubeError(err, step = '') {
  if (err?.code === 'youtube_not_connected') return err;
  if (err?.code === 'youtube_api_error') {
    if (step && !err.youtubeStep) err.youtubeStep = step;
    return err;
  }
  const info = describeYoutubeApiError(err);
  const stepLabel = step || info.step;
  const reasonBit = info.reason ? `${info.reason} — ${info.message}` : info.message;
  const safe = new Error(
    stepLabel ? `YouTube ${stepLabel} failed: ${reasonBit}` : `YouTube Live creation failed: ${reasonBit}`
  );
  safe.statusCode = info.status;
  safe.code = 'youtube_api_error';
  safe.youtubeReason = info.reason;
  safe.youtubeStep = stepLabel;
  return safe;
}

export function isYoutubeQuotaExceeded(err) {
  const info = describeYoutubeApiError(err);
  return (
    info.reason === 'quotaExceeded' ||
    info.reason === 'dailyLimitExceeded' ||
    /quotaExceeded|quota exceeded|dailyLimitExceeded/i.test(info.message)
  );
}

function isTransientYoutubeError(err) {
  if (isYoutubeQuotaExceeded(err)) return false;
  const info = describeYoutubeApiError(err);
  if (info.status === 401 || info.status === 403 || info.status === 400) return false;
  const code = String(err?.code || '');
  return (
    info.status >= 500 ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND'
  );
}

async function youtubeApiCall(method, eventId, fn) {
  youtubeLog(`API method: ${method}`);
  youtubeLog(`Event ID: ${eventId || ''}`);
  try {
    const result = await fn();
    youtubeLog('Result: success', { method, eventId: eventId || '' });
    return result;
  } catch (err) {
    youtubeLog('Result: failure', { method, eventId: eventId || '', ...describeYoutubeApiError(err) });
    throw err;
  }
}

async function withTransientRetry(method, eventId, fn, { attempts = 2 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await youtubeApiCall(method, eventId, fn);
    } catch (err) {
      lastErr = err;
      if (isYoutubeQuotaExceeded(err) || !isTransientYoutubeError(err) || i === attempts - 1) {
        throw wrapYoutubeError(err, method);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw wrapYoutubeError(lastErr, method);
}

async function authorizedClientForUser(userId) {
  const cred = await loadUserCredential(userId, { withSecrets: true });
  const tokenFound = Boolean(cred?.connected && cred?.refreshTokenEnc);
  youtubeLog('OAuth token found: ' + tokenFound, {
    userId: String(userId || ''),
    connected: Boolean(cred?.connected),
    hasRefreshToken: Boolean(cred?.refreshTokenEnc),
    hasAccessToken: Boolean(cred?.accessTokenEnc),
    channelId: cred?.channelId || '',
    scopes: cred?.scopes || [],
  });
  if (!cred || !cred.connected || !cred.refreshTokenEnc) {
    const err = new Error('YouTube is not connected for this account');
    err.code = 'youtube_not_connected';
    err.statusCode = 400;
    throw err;
  }
  const g = getYoutubeGoogleAdapter();
  const client = g.createClient({
    clientId: env.youtube.clientId,
    clientSecret: env.youtube.clientSecret,
    redirectUri: env.youtube.redirectUri,
  });
  client.setCredentials({
    access_token: cred.accessTokenEnc ? decryptYoutubeToken(cred.accessTokenEnc) : '',
    refresh_token: decryptYoutubeToken(cred.refreshTokenEnc),
    expiry_date: cred.accessTokenExpiresAt ? cred.accessTokenExpiresAt.getTime() : undefined,
  });
  if (typeof client.on === 'function') {
    client.on('tokens', (tokens) => {
      applyRefreshedTokens(userId, tokens).catch(() => {});
    });
  }

  const expiresAt = cred.accessTokenExpiresAt ? cred.accessTokenExpiresAt.getTime() : 0;
  const expired = !expiresAt || expiresAt <= Date.now() + 60_000;
  youtubeLog('Access token refresh attempted', { needed: expired });
  if (expired && typeof client.getAccessToken === 'function') {
    try {
      await client.getAccessToken();
      if (client.credentials) {
        await applyRefreshedTokens(userId, client.credentials);
      }
    } catch (err) {
      youtubeLog('Access token refresh failed', describeYoutubeApiError(err));
      throw wrapYoutubeError(err, 'oauth.refresh');
    }
  }

  return { client, youtube: g.youtubeClient(client), credential: cred };
}

function apiData(res) {
  return res?.data || res || {};
}

export function youtubeWatchUrl(broadcastId) {
  const id = String(broadcastId || '').trim();
  return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

export function scheduledStartIso(startTime) {
  const parsed = startTime ? new Date(startTime) : new Date();
  const t = Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
  return new Date(Math.max(t, Date.now() + 60_000)).toISOString();
}

export function publicYoutubeIngest(live) {
  if (!live) return null;
  return {
    watchUrl: live.watchUrl || '',
    broadcastId: live.broadcastId || '',
    streamId: live.streamId || '',
    rtmpUrl: live.rtmpUrl || '',
    streamKey: live.streamKey || '',
  };
}

export function applyYoutubeLiveFields(target, live) {
  if (!target || !live) return target;
  const fields = youtubeDocFields(target);
  const manualId =
    extractYouTubeId(target.youtubeLiveUrl) ||
    extractYouTubeId(fields.youtubeVideoId) ||
    extractYouTubeId(fields.youtubeWatchUrl) ||
    extractYouTubeId(fields.streamUrl) ||
    extractYouTubeId(fields.youtubeLiveUrl) ||
    '';
  if (manualId) {
    // Manual URL / video ID has absolute priority over a generated broadcast.
    if (live.rtmpUrl) target.youtubeRtmpUrl = live.rtmpUrl;
    if (live.streamKey) target.youtubeStreamKey = live.streamKey;
    if (live.streamId) target.youtubeLiveStreamId = live.streamId;
    return target;
  }
  target.youtubeVideoId = live.broadcastId || target.youtubeVideoId;
  target.streamUrl = live.watchUrl || target.streamUrl;
  target.youtubeWatchUrl = live.watchUrl || '';
  target.youtubeBroadcastId = live.broadcastId || '';
  target.youtubeLiveStreamId = live.streamId || '';
  if (live.rtmpUrl) target.youtubeRtmpUrl = live.rtmpUrl;
  if (live.streamKey) target.youtubeStreamKey = live.streamKey;
  return target;
}

function pickYoutubeFields(src = {}) {
  return {
    isOnline: src.isOnline,
    youtubeVideoId: src.youtubeVideoId || '',
    streamUrl: src.streamUrl || '',
    youtubeWatchUrl: src.youtubeWatchUrl || '',
    youtubeLiveUrl: src.youtubeLiveUrl || '',
    youtubeStreamKey: src.youtubeStreamKey || '',
    youtubeBroadcastId: src.youtubeBroadcastId || '',
  };
}

/** Readable YouTube fields from a plain object or Mongoose document (spread is unsafe). */
export function youtubeDocFields(doc) {
  if (!doc) return pickYoutubeFields();
  if (typeof doc.get === 'function') {
    const fromGet = pickYoutubeFields({
      isOnline: doc.get('isOnline'),
      youtubeVideoId: doc.get('youtubeVideoId'),
      streamUrl: doc.get('streamUrl'),
      youtubeWatchUrl: doc.get('youtubeWatchUrl'),
      youtubeLiveUrl: doc.youtubeLiveUrl,
      youtubeStreamKey: doc.get('youtubeStreamKey'),
      youtubeBroadcastId: doc.get('youtubeBroadcastId'),
    });
    if (
      fromGet.youtubeVideoId ||
      fromGet.streamUrl ||
      fromGet.youtubeWatchUrl ||
      fromGet.youtubeBroadcastId ||
      fromGet.isOnline !== undefined
    ) {
      return fromGet;
    }
  }
  if (typeof doc.toObject === 'function') {
    try {
      return pickYoutubeFields(doc.toObject({ depopulate: true, virtuals: false }));
    } catch {
      /* fall through */
    }
  }
  if (doc._doc) return pickYoutubeFields(doc._doc);
  return pickYoutubeFields(doc);
}

/**
 * Manual YouTube URL / video ID from a create/update body or event.
 * URL fields win over a bare youtubeVideoId.
 */
export function resolveYoutubeInput(source = {}) {
  const fields = youtubeDocFields(source);
  const youtubeLiveUrl = String(source.youtubeLiveUrl || fields.youtubeLiveUrl || '').trim();
  const youtubeWatchUrl = String(source.youtubeWatchUrl || fields.youtubeWatchUrl || '').trim();
  const streamUrl = String(source.streamUrl || fields.streamUrl || '').trim();
  const youtubeVideoId = String(source.youtubeVideoId || fields.youtubeVideoId || '').trim();
  const inputUrl = youtubeLiveUrl || youtubeWatchUrl || streamUrl || youtubeVideoId || '';
  const detectedVideoId =
    extractYouTubeId(youtubeLiveUrl) ||
    extractYouTubeId(youtubeWatchUrl) ||
    extractYouTubeId(streamUrl) ||
    extractYouTubeId(youtubeVideoId) ||
    '';
  return { inputUrl, detectedVideoId, youtubeLiveUrl, youtubeWatchUrl, streamUrl, youtubeVideoId };
}

/** Persist a pasted YouTube URL and its exact video ID. Never invent a broadcast. */
export function applyManualYoutubeFields(target, { inputUrl = '', detectedVideoId = '' } = {}) {
  if (!target || !detectedVideoId) return target;
  const urlId = extractYouTubeId(inputUrl);
  const preservedUrl =
    inputUrl && (urlId === detectedVideoId || String(inputUrl).includes(detectedVideoId))
      ? String(inputUrl).trim()
      : `https://www.youtube.com/watch?v=${detectedVideoId}`;
  target.youtubeVideoId = detectedVideoId;
  target.streamUrl = preservedUrl;
  target.youtubeWatchUrl = preservedUrl;
  // Align so public lookup cannot keep a stale auto-created broadcast id.
  target.youtubeBroadcastId = detectedVideoId;
  return target;
}

export function logManualYoutubeUrlTrace({
  inputUrl = '',
  detectedVideoId = '',
  existingVideoId = '',
  generatedVideoId = '',
  finalVideoId = '',
} = {}) {
  // eslint-disable-next-line no-console
  console.info('[YT MANUAL URL]');
  // eslint-disable-next-line no-console
  console.info('input URL:', inputUrl || '');
  // eslint-disable-next-line no-console
  console.info('detected video ID:', detectedVideoId || '');
  // eslint-disable-next-line no-console
  console.info('existing event video ID:', existingVideoId || '');
  // eslint-disable-next-line no-console
  console.info('generated video ID:', generatedVideoId || '');
  // eslint-disable-next-line no-console
  console.info('final saved video ID:', finalVideoId || '');
}

export function logYoutubeSaveDebug({
  youtubeLiveUrl = '',
  youtubeWatchUrl = '',
  streamUrl = '',
  youtubeVideoId = '',
  detectedManualVideoId = '',
  existingVideoId = '',
  generatedBroadcastId = '',
  finalYoutubeVideoId = '',
} = {}) {
  // eslint-disable-next-line no-console
  console.info('[YT DEBUG]');
  // eslint-disable-next-line no-console
  console.info('raw youtubeLiveUrl:', youtubeLiveUrl || '');
  // eslint-disable-next-line no-console
  console.info('raw youtubeWatchUrl:', youtubeWatchUrl || '');
  // eslint-disable-next-line no-console
  console.info('raw streamUrl:', streamUrl || '');
  // eslint-disable-next-line no-console
  console.info('raw youtubeVideoId:', youtubeVideoId || '');
  // eslint-disable-next-line no-console
  console.info('detectedManualVideoId:', detectedManualVideoId || '');
  // eslint-disable-next-line no-console
  console.info('existingVideoId:', existingVideoId || '');
  // eslint-disable-next-line no-console
  console.info('generatedBroadcastId:', generatedBroadcastId || '');
  // eslint-disable-next-line no-console
  console.info('finalYoutubeVideoId:', finalYoutubeVideoId || '');
}

/**
 * True when we should call YouTube Live API instead of requiring a pasted URL.
 * Manual URL / existing video ID always wins.
 */
export function shouldAutoCreateYoutubeLive(input = {}) {
  const fields = youtubeDocFields(input);
  const streamType = input.streamType;
  const isOnline = input.isOnline !== undefined ? input.isOnline : fields.isOnline;
  if (isOnline === false) return false;
  const merged = {
    ...fields,
    youtubeLiveUrl: input.youtubeLiveUrl || fields.youtubeLiveUrl,
    youtubeWatchUrl: input.youtubeWatchUrl || fields.youtubeWatchUrl,
    streamUrl: input.streamUrl || fields.streamUrl,
    youtubeVideoId: input.youtubeVideoId || fields.youtubeVideoId,
  };
  if (resolveYoutubeInput(merged).detectedVideoId) return false;
  if (String(fields.youtubeBroadcastId || input.youtubeBroadcastId || '').trim()) return false;
  if (streamType === 'youtube' || streamType === 'youtube_server') return true;
  if (streamType === 'server_youtube') {
    return !String(fields.youtubeStreamKey || input.youtubeStreamKey || '').trim();
  }
  return false;
}

export async function getYoutubeApiForUser(userId) {
  return authorizedClientForUser(userId);
}

export async function liveBroadcastsInsert(userId, resource) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.insert(resource);
}

export async function liveStreamsInsert(userId, resource) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveStreams.insert(resource);
}

export async function liveBroadcastsBind(userId, params) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.bind(params);
}

export async function liveBroadcastsUpdate(userId, resource) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.update(resource);
}

export async function liveBroadcastsList(userId, params = {}) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status', 'contentDetails'],
    mine: true,
    ...params,
  });
}

export async function liveStreamsList(userId, params = {}) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveStreams.list({
    part: ['id', 'snippet', 'cdn', 'status'],
    mine: true,
    ...params,
  });
}

export async function liveBroadcastsTransition(userId, params) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.transition(params);
}

/** Insert broadcast + stream, bind them, return ingest details. Does not log tokens. */
export async function insertBindYoutubeLive(
  youtube,
  { title, description, startTime, eventId = '', persist } = {}
) {
  const snippetTitle = String(title || 'EventLivePro Live').slice(0, 100);
  const savePartial = async (partial) => {
    if (typeof persist !== 'function') return;
    await persist(partial);
  };

  youtubeLog('Creating broadcast', { title: snippetTitle, eventId: eventId || '' });
  const broadcastRes = await withTransientRetry('liveBroadcasts.insert', eventId, () =>
    youtube.liveBroadcasts.insert({
      part: ['id', 'snippet', 'contentDetails', 'status'],
      requestBody: {
        snippet: {
          title: snippetTitle,
          description: String(description || '').slice(0, 5000),
          scheduledStartTime: scheduledStartIso(startTime),
        },
        status: {
          privacyStatus: 'unlisted',
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: false,
          enableEmbed: true,
          enableDvr: true,
          recordFromStart: true,
          monitorStream: { enableMonitorStream: false },
        },
      },
    })
  );
  const broadcast = apiData(broadcastRes);
  const broadcastId = broadcast.id;
  youtubeLog('Broadcast response', { ok: true, broadcastId: broadcastId || '' });
  if (!broadcastId) {
    const err = new Error('youtube_broadcast_missing_id');
    err.statusCode = 502;
    throw wrapYoutubeError(err, 'liveBroadcasts.insert');
  }
  youtubeLog('Final video ID', { broadcastId });
  const watchUrl = youtubeWatchUrl(broadcastId);
  await savePartial({ broadcastId, watchUrl });

  youtubeLog('Creating stream');
  const streamRes = await withTransientRetry('liveStreams.insert', eventId, () =>
    youtube.liveStreams.insert({
      part: ['id', 'snippet', 'cdn', 'status'],
      requestBody: {
        snippet: { title: `${snippetTitle} stream`.slice(0, 100) },
        cdn: {
          frameRate: 'variable',
          ingestionType: 'rtmp',
          resolution: 'variable',
        },
      },
    })
  );
  const stream = apiData(streamRes);
  const streamId = stream.id;
  youtubeLog('Stream response', { ok: true, streamId: streamId || '' });
  if (!streamId) {
    const err = new Error('youtube_stream_missing_id');
    err.statusCode = 502;
    throw wrapYoutubeError(err, 'liveStreams.insert');
  }
  youtubeLog('Final stream ID', { streamId });

  let ingest = stream.cdn?.ingestionInfo || {};
  let streamKey = String(ingest.streamName || '').trim();
  const rtmpUrl =
    ingest.ingestionAddress || ingest.rtmpsIngestionAddress || 'rtmp://a.rtmp.youtube.com/live2';
  youtubeLog('Stream key available: ' + Boolean(streamKey));
  await savePartial({
    broadcastId,
    watchUrl,
    streamId,
    rtmpUrl,
    streamKey,
  });

  youtubeLog('Binding broadcast and stream', { broadcastId, streamId });
  await withTransientRetry('liveBroadcasts.bind', eventId, () =>
    youtube.liveBroadcasts.bind({
      part: ['id', 'snippet', 'contentDetails', 'status'],
      id: broadcastId,
      streamId,
    })
  );

  // Bind can reset auto-start. One update only — never on status polls.
  if (typeof youtube.liveBroadcasts.update === 'function') {
    await withTransientRetry('liveBroadcasts.update', eventId, () =>
      youtube.liveBroadcasts.update({
        part: ['id', 'contentDetails', 'status'],
        requestBody: {
          id: broadcastId,
          status: {
            privacyStatus: 'unlisted',
            selfDeclaredMadeForKids: false,
          },
          contentDetails: {
            enableAutoStart: true,
            enableAutoStop: false,
            enableEmbed: true,
            enableDvr: true,
            recordFromStart: true,
            monitorStream: { enableMonitorStream: false },
          },
        },
      })
    );
  }

  if (!streamKey && typeof youtube.liveStreams.list === 'function') {
    try {
      const listed = await youtubeApiCall('liveStreams.list', eventId, () =>
        youtube.liveStreams.list({
          part: ['id', 'cdn'],
          id: [streamId],
          maxResults: 1,
        })
      );
      const item = apiData(listed)?.items?.[0] || {};
      ingest = item.cdn?.ingestionInfo || ingest;
      streamKey = String(ingest.streamName || '').trim();
    } catch (err) {
      youtubeLog('Stream list for ingest key', { ok: false, ...describeYoutubeApiError(err) });
    }
  }
  youtubeLog('Stream key available: ' + Boolean(streamKey));
  if (!streamKey) {
    const err = new Error('youtube_stream_missing_key');
    err.statusCode = 502;
    throw wrapYoutubeError(err, 'liveStreams.insert');
  }
  await savePartial({
    broadcastId,
    watchUrl,
    streamId,
    rtmpUrl: ingest.ingestionAddress || ingest.rtmpsIngestionAddress || rtmpUrl,
    streamKey,
  });

  return {
    broadcastId,
    streamId,
    watchUrl,
    rtmpUrl: ingest.ingestionAddress || ingest.rtmpsIngestionAddress || rtmpUrl,
    streamKey,
  };
}

export async function createBoundYoutubeLive(userId, meta = {}) {
  const { youtube } = await authorizedClientForUser(userId);
  return insertBindYoutubeLive(youtube, meta);
}

/**
 * If the event needs a YouTube live and no URL was pasted, create one with the
 * authenticated user's existing OAuth credentials. Returns ingest for the admin
 * response, or null when a manual URL should be used / YouTube is not connected.
 */
export async function provisionYoutubeLiveIfNeeded(
  user,
  payload,
  streamType,
  { existingVideoId = '' } = {}
) {
  const fields = youtubeDocFields(payload);
  const manual = resolveYoutubeInput({
    ...fields,
    youtubeLiveUrl: payload?.youtubeLiveUrl || fields.youtubeLiveUrl,
    youtubeWatchUrl: payload?.youtubeWatchUrl || fields.youtubeWatchUrl,
    streamUrl: payload?.streamUrl || fields.streamUrl,
    youtubeVideoId: payload?.youtubeVideoId || fields.youtubeVideoId,
  });
  if (manual.detectedVideoId) {
    applyManualYoutubeFields(payload, manual);
    return null;
  }

  const keepId =
    extractYouTubeId(existingVideoId) ||
    extractYouTubeId(fields.youtubeVideoId) ||
    extractYouTubeId(fields.streamUrl) ||
    extractYouTubeId(fields.youtubeWatchUrl) ||
    extractYouTubeId(fields.youtubeLiveUrl) ||
    '';
  if (keepId) {
    if (!extractYouTubeId(payload.youtubeVideoId)) payload.youtubeVideoId = keepId;
    return null;
  }

  if (!shouldAutoCreateYoutubeLive({ ...fields, streamType, youtubeLiveUrl: payload?.youtubeLiveUrl })) {
    youtubeLog('Create live request started', { skipped: 'already_has_youtube_or_not_youtube_dest' });
    return null;
  }
  youtubeLog('Create live request started', {
    userId: String(user?._id || ''),
    title: payload?.title || '',
    streamType: streamType || '',
  });
  const cred = await loadUserCredential(user?._id);
  youtubeLog('OAuth token found: ' + Boolean(cred?.connected), {
    connected: Boolean(cred?.connected),
    channelId: cred?.channelId || '',
    channelTitle: cred?.channelTitle || '',
  });
  if (!cred?.connected) {
    const err = new Error('YouTube is not connected for this account');
    err.code = 'youtube_not_connected';
    err.statusCode = 400;
    throw err;
  }

  try {
    const eventId = String(payload?._id || payload?.id || '');
    const live = await createBoundYoutubeLive(user._id, {
      title: payload.title,
      description: payload.description,
      startTime: payload.startTime,
      eventId,
      persist: async (partial) => {
        applyYoutubeLiveFields(payload, partial);
        if (typeof payload.save === 'function') await payload.save();
      },
    });
    youtubeLog('Saving YouTube data to event', {
      eventId,
      broadcastId: live.broadcastId || '',
      streamId: live.streamId || '',
      watchUrl: live.watchUrl || '',
      streamKeyAvailable: Boolean(live.streamKey),
    });
    applyYoutubeLiveFields(payload, live);
    youtubeLog('Creation completed', { broadcastId: live.broadcastId || '', watchUrl: live.watchUrl || '' });
    return publicYoutubeIngest(live);
  } catch (err) {
    youtubeLog('Creation failed', describeYoutubeApiError(err));
    throw wrapYoutubeError(err);
  }
}

/**
 * Read the live broadcast's actual video id + lifecycle. Does NOT transition
 * or stop the broadcast.
 */
function playbackInfoFromBroadcastItem(item) {
  if (!item?.id) return null;
  const lifeCycleStatus = String(item.status?.lifeCycleStatus || '').toLowerCase();
  const privacyStatus = String(item.status?.privacyStatus || '').toLowerCase();
  const enableEmbed = item.contentDetails?.enableEmbed !== false;
  return {
    videoId: item.id,
    broadcastId: item.id,
    title: String(item.snippet?.title || ''),
    watchUrl: youtubeWatchUrl(item.id),
    lifeCycleStatus,
    privacyStatus,
    enableEmbed,
    actualStartTime: item.snippet?.actualStartTime || item.snippet?.scheduledStartTime || '',
    isLive: lifeCycleStatus === 'live' || lifeCycleStatus === 'testing',
  };
}

/** Normalize titles so "Srinivas weds mounika reception" matches Studio copies. */
export function youtubeTitleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titlesMatch(eventTitle, broadcastTitle) {
  const eventKey = youtubeTitleKey(eventTitle);
  const liveKey = youtubeTitleKey(broadcastTitle);
  if (!eventKey || !liveKey) return false;
  return eventKey === liveKey || eventKey.includes(liveKey) || liveKey.includes(eventKey);
}

/**
 * Params for the currently-live broadcasts on the connected channel.
 * broadcastType MUST be `all`: YouTube defaults to `event`, which hides
 * Studio "Stream now" / persistent lives (the /live/VIDEO_ID URL).
 */
export function activeLiveBroadcastListParams() {
  return {
    part: ['id', 'snippet', 'status', 'contentDetails'],
    mine: true,
    broadcastStatus: 'active',
    broadcastType: 'all',
    maxResults: 50,
  };
}

/**
 * Event-owned YouTube id for API lookup.
 * Manual URL / youtubeVideoId always win over a generated broadcast id.
 */
export function eventYoutubeLookupId(event) {
  const fields = youtubeDocFields(event);
  return (
    extractYouTubeId(fields.youtubeVideoId) ||
    extractYouTubeId(fields.streamUrl) ||
    extractYouTubeId(fields.youtubeWatchUrl) ||
    extractYouTubeId(fields.youtubeLiveUrl) ||
    extractYouTubeId(fields.youtubeBroadcastId) ||
    String(fields.youtubeVideoId || fields.youtubeBroadcastId || '').trim()
  );
}

/** createdBy first, then organizer — YouTube OAuth may live on either user. */
export function youtubeOauthUserIds(event) {
  const ids = [];
  const push = (value) => {
    if (value == null || value === '') return;
    const id = String(value._id || value.id || value).trim();
    if (id && id !== 'undefined' && id !== 'null' && !ids.includes(id)) ids.push(id);
  };
  push(event?.createdBy);
  push(event?.organizer);
  return ids;
}

/**
 * If the event's own broadcast is already live, keep it. Otherwise pick the
 * connected account's currently active live (OBS "Stream now" / Studio live)
 * instead of embedding a still-scheduled waiting broadcast.
 *
 * Auto-created EventLivePro broadcasts stay `ready` until that specific ingest
 * is used. Studio Go Live creates a different persistent broadcast — that live
 * ID must win for public playback (do not keep the waiting stored ID).
 */
export function selectLiveYoutubePlayback(
  storedInfo,
  activeInfos = [],
  { eventBroadcastId = '', eventTitle = '', allowActiveFallback = true } = {}
) {
  if (storedInfo?.isLive) return storedInfo;
  if (!allowActiveFallback) return storedInfo || null;
  const actives = Array.isArray(activeInfos) ? activeInfos.filter((item) => item?.videoId) : [];
  const liveActives = actives.filter((item) => item.isLive === true);
  const pool = liveActives.length ? liveActives : actives;
  const own = String(eventBroadcastId || storedInfo?.broadcastId || '').trim();
  const ownLive = pool.find((item) => item.videoId === own || item.broadcastId === own);
  if (ownLive) return ownLive;
  const titled = pool.find((item) => titlesMatch(eventTitle, item.title));
  if (titled) return titled;
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) {
    return [...pool].sort((a, b) => {
      const ta = Date.parse(a.actualStartTime || '') || 0;
      const tb = Date.parse(b.actualStartTime || '') || 0;
      return tb - ta;
    })[0];
  }
  return storedInfo || null;
}

export async function getBroadcastPlaybackInfo(userId, broadcastOrVideoId) {
  const id = String(broadcastOrVideoId || '').trim();
  if (!userId || !id) return null;
  const { youtube } = await authorizedClientForUser(userId);
  const res = await youtubeApiCall('liveBroadcasts.list', '', () =>
    youtube.liveBroadcasts.list({
      part: ['id', 'snippet', 'status', 'contentDetails'],
      id: [id],
      maxResults: 1,
    })
  );
  return playbackInfoFromBroadcastItem(apiData(res)?.items?.[0]);
}

/** Currently live/testing broadcasts on the connected YouTube account. */
export async function listActiveBroadcastPlayback(userId) {
  if (!userId) return [];
  const { youtube } = await authorizedClientForUser(userId);
  const res = await youtubeApiCall('liveBroadcasts.list', '', () =>
    youtube.liveBroadcasts.list(activeLiveBroadcastListParams())
  );
  return (apiData(res)?.items || [])
    .map(playbackInfoFromBroadcastItem)
    .filter(Boolean);
}

/** Turn on embed for older auto-created broadcasts. Never transitions/stops. */
export async function ensureBroadcastEmbeddable(userId, info) {
  if (!userId || !info?.broadcastId) return info;
  if (info.enableEmbed && info.privacyStatus !== 'private') return info;
  const { youtube } = await authorizedClientForUser(userId);
  await youtubeApiCall('liveBroadcasts.update', '', () =>
    youtube.liveBroadcasts.update({
      part: ['id', 'contentDetails', 'status'],
      requestBody: {
        id: info.broadcastId,
        status: {
          privacyStatus: info.privacyStatus === 'private' ? 'unlisted' : info.privacyStatus || 'unlisted',
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: false,
          enableEmbed: true,
          enableDvr: true,
          recordFromStart: true,
          monitorStream: { enableMonitorStream: false },
        },
      },
    })
  );
  return {
    ...info,
    enableEmbed: true,
    privacyStatus: info.privacyStatus === 'private' ? 'unlisted' : info.privacyStatus,
  };
}
