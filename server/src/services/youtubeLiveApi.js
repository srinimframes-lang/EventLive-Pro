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

async function authorizedClientForUser(userId) {
  const cred = await loadUserCredential(userId, { withSecrets: true });
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
  target.youtubeVideoId = live.broadcastId || target.youtubeVideoId;
  target.streamUrl = live.watchUrl || target.streamUrl;
  target.youtubeWatchUrl = live.watchUrl || '';
  target.youtubeBroadcastId = live.broadcastId || '';
  target.youtubeLiveStreamId = live.streamId || '';
  if (live.rtmpUrl) target.youtubeRtmpUrl = live.rtmpUrl;
  if (live.streamKey) target.youtubeStreamKey = live.streamKey;
  return target;
}

/**
 * True when we should call YouTube Live API instead of requiring a pasted URL.
 * Manual URL / existing video ID always wins (fallback).
 */
export function shouldAutoCreateYoutubeLive({
  streamType,
  isOnline,
  youtubeVideoId,
  streamUrl,
  youtubeStreamKey,
  youtubeBroadcastId,
} = {}) {
  if (isOnline === false) return false;
  if (String(youtubeBroadcastId || '').trim()) return false;
  const hasManualVideo = Boolean(extractYouTubeId(youtubeVideoId) || extractYouTubeId(streamUrl));
  if (hasManualVideo) return false;
  if (streamType === 'youtube' || streamType === 'youtube_server') return true;
  if (streamType === 'server_youtube') {
    return !String(youtubeStreamKey || '').trim();
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
export async function insertBindYoutubeLive(youtube, { title, description, startTime } = {}) {
  const snippetTitle = String(title || 'EventLivePro Live').slice(0, 100);
  const broadcastRes = await youtube.liveBroadcasts.insert({
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
  });
  const broadcast = apiData(broadcastRes);
  const broadcastId = broadcast.id;
  if (!broadcastId) {
    const err = new Error('youtube_broadcast_missing_id');
    err.statusCode = 502;
    throw err;
  }

  const streamRes = await youtube.liveStreams.insert({
    part: ['id', 'snippet', 'cdn', 'status'],
    requestBody: {
      snippet: { title: `${snippetTitle} stream`.slice(0, 100) },
      cdn: {
        frameRate: 'variable',
        ingestionType: 'rtmp',
        resolution: 'variable',
      },
    },
  });
  const stream = apiData(streamRes);
  const streamId = stream.id;
  if (!streamId) {
    const err = new Error('youtube_stream_missing_id');
    err.statusCode = 502;
    throw err;
  }

  await youtube.liveBroadcasts.bind({
    part: ['id', 'snippet', 'contentDetails', 'status'],
    id: broadcastId,
    streamId,
  });

  // Bind puts the broadcast in `ready`. Re-apply auto-start after bind so OBS
  // can push RTMP without finishing setup in YouTube Studio.
  if (typeof youtube.liveBroadcasts.update === 'function') {
    await youtube.liveBroadcasts.update({
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
    });
  }

  const ingest = stream.cdn?.ingestionInfo || {};
  const streamKey = String(ingest.streamName || '').trim();
  if (!streamKey) {
    const err = new Error('youtube_stream_missing_key');
    err.statusCode = 502;
    throw err;
  }

  return {
    broadcastId,
    streamId,
    watchUrl: youtubeWatchUrl(broadcastId),
    rtmpUrl:
      ingest.ingestionAddress || ingest.rtmpsIngestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
    streamKey,
  };
}

export async function createBoundYoutubeLive(userId, meta) {
  const { youtube } = await authorizedClientForUser(userId);
  return insertBindYoutubeLive(youtube, meta);
}

/**
 * If the event needs a YouTube live and no URL was pasted, create one with the
 * authenticated user's existing OAuth credentials. Returns ingest for the admin
 * response, or null when a manual URL should be used / YouTube is not connected.
 */
export async function provisionYoutubeLiveIfNeeded(user, payload, streamType) {
  if (!shouldAutoCreateYoutubeLive({ ...payload, streamType })) return null;
  const cred = await loadUserCredential(user?._id);
  if (!cred?.connected) return null;

  try {
    const live = await createBoundYoutubeLive(user._id, {
      title: payload.title,
      description: payload.description,
      startTime: payload.startTime,
    });
    applyYoutubeLiveFields(payload, live);
    return publicYoutubeIngest(live);
  } catch (err) {
    if (err.code === 'youtube_not_connected') return null;
    const safe = new Error(
      'Could not create the YouTube live broadcast. Paste a YouTube Live URL or reconnect YouTube.'
    );
    safe.statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 502;
    throw safe;
  }
}

/**
 * Read the live broadcast's actual video id + lifecycle. Does NOT transition
 * or stop the broadcast.
 */
export async function getBroadcastPlaybackInfo(userId, broadcastOrVideoId) {
  const id = String(broadcastOrVideoId || '').trim();
  if (!userId || !id) return null;
  const { youtube } = await authorizedClientForUser(userId);
  const res = await youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status', 'contentDetails'],
    id: [id],
    maxResults: 1,
  });
  const item = apiData(res)?.items?.[0];
  if (!item?.id) return null;
  const lifeCycleStatus = String(item.status?.lifeCycleStatus || '').toLowerCase();
  const privacyStatus = String(item.status?.privacyStatus || '').toLowerCase();
  const enableEmbed = item.contentDetails?.enableEmbed !== false;
  return {
    videoId: item.id,
    broadcastId: item.id,
    watchUrl: youtubeWatchUrl(item.id),
    lifeCycleStatus,
    privacyStatus,
    enableEmbed,
    isLive: lifeCycleStatus === 'live' || lifeCycleStatus === 'testing',
  };
}

/** Turn on embed for older auto-created broadcasts. Never transitions/stops. */
export async function ensureBroadcastEmbeddable(userId, info) {
  if (!userId || !info?.broadcastId) return info;
  if (info.enableEmbed && info.privacyStatus !== 'private') return info;
  const { youtube } = await authorizedClientForUser(userId);
  await youtube.liveBroadcasts.update({
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
  });
  return {
    ...info,
    enableEmbed: true,
    privacyStatus: info.privacyStatus === 'private' ? 'unlisted' : info.privacyStatus,
  };
}
