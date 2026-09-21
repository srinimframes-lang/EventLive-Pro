/**
 * Official Cloudflare Stream Web Player (iframe) helpers.
 * Origin is always taken from the event's existing Cloudflare HLS URL.
 * Never invents a customer subdomain or account id.
 */

export const CLOUDFLARE_RECORDING_PREPARING_MESSAGE = 'Recording is preparing…';
export const LIVE_WAITING_MESSAGE = 'Waiting for live…';
export const CLOUDFLARE_STREAM_SDK_SRC =
  'https://embed.cloudflarestream.com/embed/sdk.latest.js';

function trim(value) {
  return String(value || '').trim();
}

export function cloudflareStreamOriginFromUrl(url) {
  try {
    const parsed = new URL(trim(url));
    const host = parsed.hostname.toLowerCase();
    if (host === 'cloudflarestream.com' || host.endsWith('.cloudflarestream.com')) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    /* ignore */
  }
  return '';
}

export function buildCloudflareStreamIframeUrl({
  originUrl = '',
  uid = '',
  mode = 'live',
  poster = '',
} = {}) {
  const origin = cloudflareStreamOriginFromUrl(originUrl);
  const id = trim(uid);
  if (!origin || !id) return '';
  try {
    const parsed = new URL(`${origin}/${id}/iframe`);
    parsed.searchParams.set('autoplay', 'true');
    parsed.searchParams.set('muted', 'true');
    parsed.searchParams.set('controls', 'true');
    parsed.searchParams.set('letterboxColor', 'black');
    if (mode === 'recorded') {
      parsed.searchParams.set('loop', 'false');
      parsed.searchParams.set('startTime', '0');
      parsed.searchParams.set('preload', 'auto');
    }
    const posterUrl = trim(poster);
    if (posterUrl) parsed.searchParams.set('poster', posterUrl);
    return parsed.toString();
  } catch {
    return '';
  }
}

function playbackOriginUrl(config) {
  return (
    trim(config?.cfStreamPlayerUrl) ||
    trim(config?.cfStreamHlsUrl) ||
    trim(config?.cfStreamPlaybackHlsUrl) ||
    trim(config?.playbackUrl) ||
    trim(config?.hlsUrl)
  );
}

/** Website YouTube embed — leftover Cloudflare ingest must not own the player. */
export function isYoutubeOnlyWebsitePlayback(config = {}) {
  if (!config) return false;
  const dest = String(config.streamingDestination || '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_');
  const streamingProvider = String(config.streamingProvider || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const provider = String(config.provider || config.streamProvider || '')
    .trim()
    .toLowerCase();
  if (streamingProvider === 'youtube' || dest === 'youtube' || dest === 'youtube_server') {
    return true;
  }
  return provider === 'youtube' && dest !== 'server_youtube';
}

export function isCloudflareStreamEventConfig(config) {
  if (!config) return false;
  if (
    String(config.streamingProvider || '') === 'external_embed' ||
    String(config.viewerPlayback || '') === 'external_embed' ||
    String(config.streamingProvider || '') === 'mux' ||
    String(config.viewerPlayback || '') === 'mux' ||
    isYoutubeOnlyWebsitePlayback(config)
  ) {
    return false;
  }
  if (String(config.liveIngestProvider || '') === 'cloudflare_stream') return true;
  if (String(config.viewerPlayback || '') === 'cloudflare_stream') return true;
  if (
    trim(config.cfStreamLiveInputId) ||
    trim(config.cfStreamVideoUid) ||
    trim(config.cfStreamPlayerUrl) ||
    trim(config.cfStreamHlsUrl)
  ) {
    return true;
  }
  return Boolean(cloudflareStreamOriginFromUrl(playbackOriginUrl(config)));
}

function statusLooksOffline(status) {
  const s = String(status || '').toLowerCase();
  return s === 'ended' || s === 'cancelled' || s === 'offline' || s === 'published' || s === 'draft';
}

/** OBS / Cloudflare publishing wins over any previous Video UID. */
function isCloudflarePlayerLive(config) {
  if (config?.isPublishing === true) return true;
  if (config?.isPublishing === false) return false;
  if (config?.playbackMode === 'recorded' || config?.playbackMode === 'offline') return false;
  if (config?.cfRecordingPreparing === true) return false;
  if (statusLooksOffline(config?.status)) return false;
  return config?.isLive === true;
}

/**
 * LIVE Input UID vs recorded Video UID for the official Stream iframe.
 * Live publishing always wins over a previous VOD.
 */
export function selectCloudflareStreamPlayer({
  config,
  recordedVodEnded = false,
} = {}) {
  if (!config || !isCloudflareStreamEventConfig(config)) return null;

  const liveInputUid = trim(config.cfStreamLiveInputId);
  const videoUid = trim(config.cfStreamVideoUid);
  const originUrl = playbackOriginUrl(config);
  const poster = trim(config.poster);

  if (isCloudflarePlayerLive(config) && liveInputUid) {
    const iframeUrl = buildCloudflareStreamIframeUrl({
      originUrl,
      uid: liveInputUid,
      mode: 'live',
      poster,
    });
    return {
      mode: 'live',
      uid: liveInputUid,
      liveInputUid,
      videoUid: '',
      iframeUrl,
      isLive: true,
      recorded: false,
      showWaitingForLive: false,
      showLiveBadge: true,
    };
  }

  if (recordedVodEnded && config.isPublishing !== true) {
    return {
      mode: 'waiting-for-live',
      uid: '',
      liveInputUid,
      videoUid,
      iframeUrl: '',
      isLive: false,
      recorded: false,
      showWaitingForLive: true,
      showLiveBadge: false,
    };
  }

  if (videoUid && videoUid !== liveInputUid) {
    const iframeUrl = buildCloudflareStreamIframeUrl({
      originUrl,
      uid: videoUid,
      mode: 'recorded',
      poster,
    });
    return {
      mode: 'recorded',
      uid: videoUid,
      liveInputUid,
      videoUid,
      iframeUrl,
      isLive: false,
      recorded: true,
      showWaitingForLive: false,
      showLiveBadge: false,
    };
  }

  return {
    mode: 'recording-preparing',
    uid: '',
    liveInputUid,
    videoUid: '',
    iframeUrl: '',
    isLive: false,
    recorded: false,
    showWaitingForLive: false,
    showLiveBadge: false,
  };
}

/**
 * Exclusive watch-page surface for Cloudflare events.
 * Never returns HLS / YouTube / MediaMTX for a Cloudflare Stream event.
 */
export function selectWatchPlayerSurface(config, { recordedVodEnded = false } = {}) {
  const player = selectCloudflareStreamPlayer({ config, recordedVodEnded });
  if (player || isCloudflareStreamEventConfig(config)) {
    return {
      surface: 'cloudflare-iframe',
      component: 'CloudflareStreamPlayer',
      player: player || {
        mode: 'recording-preparing',
        uid: '',
        liveInputUid: trim(config?.cfStreamLiveInputId),
        videoUid: '',
        iframeUrl: '',
        isLive: false,
        recorded: false,
        showWaitingForLive: false,
        showLiveBadge: false,
      },
    };
  }
  return { surface: 'other', component: '', player: null };
}

export function cloudflareStreamPlayerMountKey({ mode = '', uid = '', eventId = '' } = {}) {
  const id = trim(eventId) || 'event';
  const playerUid = trim(uid) || 'none';
  if (mode === 'recorded') return `cf-iframe-vod-${id}-${playerUid}`;
  if (mode === 'live') return `cf-iframe-live-${id}-${playerUid}`;
  return `cf-iframe-${mode || 'idle'}-${id}`;
}
