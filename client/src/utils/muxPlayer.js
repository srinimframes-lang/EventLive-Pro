/**
 * Mux Player helpers for EventLivePro watch pages.
 * Isolated from Cloudflare Stream and MediaMTX.
 */

export function isMuxPlaybackConfig(config = {}) {
  if (!config) return false;
  return (
    String(config.streamingProvider || '').trim() === 'mux' ||
    String(config.viewerPlayback || '').trim() === 'mux'
  );
}

export function muxHlsUrl(playbackId) {
  const id = String(playbackId || '').trim();
  return id ? `https://stream.mux.com/${id}.m3u8` : '';
}

export function buildMuxPlayerIframeUrl({
  playbackId = '',
  mode = 'live',
  poster = '',
} = {}) {
  const id = String(playbackId || '').trim();
  if (!id) return '';
  try {
    const url = new URL(`https://player.mux.com/${id}`);
    url.searchParams.set('autoplay', 'true');
    url.searchParams.set('muted', 'true');
    url.searchParams.set('playsinline', 'true');
    url.searchParams.set('stream-type', mode === 'recorded' ? 'on-demand' : 'live');
    const posterUrl = String(poster || '').trim();
    if (posterUrl) url.searchParams.set('poster', posterUrl);
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Live Mux playback ID vs recorded asset playback ID.
 * Never falls through to Cloudflare or MediaMTX URLs.
 */
export function selectMuxPlayer(config = {}) {
  if (!isMuxPlaybackConfig(config)) return null;

  const livePlaybackId = String(config.muxPlaybackId || '').trim();
  const vodPlaybackId = String(config.muxAssetPlaybackId || '').trim();
  const poster = String(config.poster || '').trim();
  const publishing = config.isPublishing;
  const live =
    publishing === true ||
    (publishing !== false &&
      (config.playbackMode === 'live' || config.isLive === true));

  if (live && livePlaybackId) {
    return {
      mode: 'live',
      playbackId: livePlaybackId,
      iframeUrl: buildMuxPlayerIframeUrl({ playbackId: livePlaybackId, mode: 'live', poster }),
      hlsUrl: muxHlsUrl(livePlaybackId),
      isLive: true,
      recorded: false,
    };
  }

  if (vodPlaybackId) {
    return {
      mode: 'recorded',
      playbackId: vodPlaybackId,
      iframeUrl: buildMuxPlayerIframeUrl({ playbackId: vodPlaybackId, mode: 'recorded', poster }),
      hlsUrl: muxHlsUrl(vodPlaybackId),
      isLive: false,
      recorded: true,
    };
  }

  if (config.muxRecordingPreparing === true) {
    return {
      mode: 'recording-preparing',
      playbackId: '',
      iframeUrl: '',
      hlsUrl: '',
      isLive: false,
      recorded: false,
    };
  }

  const status = String(config.status || '').toLowerCase();
  if (status === 'ended' || status === 'cancelled') {
    return {
      mode: 'ended',
      playbackId: '',
      iframeUrl: '',
      hlsUrl: '',
      isLive: false,
      recorded: false,
    };
  }

  return {
    mode: 'waiting-for-live',
    playbackId: livePlaybackId,
    iframeUrl: '',
    hlsUrl: '',
    isLive: false,
    recorded: false,
  };
}

export function muxPlayerMountKey({ mode = '', playbackId = '', eventId = '' } = {}) {
  const id = String(eventId || '').trim() || 'event';
  const pid = String(playbackId || '').trim() || 'none';
  if (mode === 'recorded') return `mux-iframe-vod-${id}-${pid}`;
  if (mode === 'live') return `mux-iframe-live-${id}-${pid}`;
  return `mux-iframe-${mode || 'idle'}-${id}`;
}
