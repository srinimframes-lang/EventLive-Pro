/**
 * Cloudflare live DVR vs recorded-VOD decisions for LivePlayer / HlsPlayer.
 * Live ingest settings stay on the default buildHlsConfig path.
 */
import {
  isCloudflareLiveDvrPlaybackUrl,
  isCloudflareStreamHlsUrl,
  isFiniteCloudflareVodUrl,
  resolveCloudflareLiveDvrUrl,
  resolveCloudflareRecordedHlsUrl,
  resolveServerPlaybackUrl,
} from './streamPlayback.js';

/** HLS tuned for low-bitrate / mobile stability (not LL-HLS). */
export function buildHlsConfig({ cloudflareDvr = false, recorded = false } = {}) {
  if (recorded) {
    return {
      enableWorker: true,
      lowLatencyMode: false,
      liveDurationInfinity: false,
      startPosition: 0,
      backBufferLength: Infinity,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.8,
      nudgeMaxRetry: 8,
      startFragPrefetch: true,
      startLevel: -1,
      abrEwmaDefaultEstimate: 1_500_000,
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,
      fragLoadingTimeOut: 30000,
      manifestLoadingTimeOut: 20000,
      levelLoadingTimeOut: 20000,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 800,
      manifestLoadingRetryDelay: 800,
    };
  }

  const config = {
    enableWorker: true,
    lowLatencyMode: false,
    liveDurationInfinity: true,
    backBufferLength: 90,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    maxBufferSize: 60 * 1000 * 1000,
    maxBufferHole: 0.8,
    nudgeMaxRetry: 8,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    maxLiveSyncPlaybackRate: 1,
    startFragPrefetch: true,
    startLevel: -1, // Auto ABR
    abrEwmaDefaultEstimate: 500_000,
    abrBandWidthFactor: 0.7,
    abrBandWidthUpFactor: 0.6,
    fragLoadingTimeOut: 30000,
    manifestLoadingTimeOut: 20000,
    levelLoadingTimeOut: 20000,
    manifestLoadingMaxRetry: 8,
    levelLoadingMaxRetry: 8,
    fragLoadingMaxRetry: 10,
    fragLoadingRetryDelay: 800,
    manifestLoadingRetryDelay: 800,
  };
  if (cloudflareDvr) {
    // Keep the full DVR window seekable; do not snap DVR viewers forward.
    config.liveMaxLatencyDurationCount = Infinity;
    config.backBufferLength = Infinity;
    config.maxMaxBufferLength = 120;
  }
  return config;
}

export function hlsPlayerLiveMode({ recorded = false, isLive = false } = {}) {
  return recorded !== true && isLive === true;
}

export function shouldShowLiveBadge({ recorded = false, isLive = false, mode = '' } = {}) {
  if (mode === 'recorded' || mode === 'recording-preparing') return false;
  if (recorded === true) return false;
  return isLive === true || mode === 'live';
}

/** Clamp a VOD timeline seek into [0, duration]. Never snaps to a live edge. */
export function clampVodSeek({
  currentTime = 0,
  duration = 0,
  target,
  expectedDurationSec = 0,
} = {}) {
  const trusted = Number(expectedDurationSec);
  const d = Number.isFinite(trusted) && trusted > 0 ? trusted : Number(duration);
  const t = Number(target);
  const cur = Number(currentTime);
  const end = Number.isFinite(d) && d > 0 ? d : 0;
  if (!Number.isFinite(t)) return Number.isFinite(cur) ? Math.max(0, cur) : 0;
  if (end <= 0) return Math.max(0, t);
  return Math.min(Math.max(t, 0), end);
}

export function vodSeekMustNotRemountHls() {
  return shouldRetryOrRemountHls({ recorded: true, atNaturalEnd: false }) === false;
}

/** Actual HlsPlayer session. A finite VOD URL can never enter the live HLS branch. */
export function resolveHlsPlayerSession({
  src = '',
  recorded = false,
  isLive = false,
  detectPublish = false,
  videoUid = '',
  liveInputId = '',
  mode = '',
} = {}) {
  const finiteVod = isFiniteCloudflareVodUrl(src, { videoUid, liveInputId });
  const vod = recorded === true || finiteVod || mode === 'recorded';
  const live = vod ? false : isLive === true || mode === 'live';
  return {
    recorded: vod,
    isLive: live,
    detectPublish: vod ? false : detectPublish === true,
    liveChrome: hlsPlayerLiveMode({ recorded: vod, isLive: live }),
    showLiveBadge: shouldShowLiveBadge({ recorded: vod, isLive: live, mode: vod ? 'recorded' : mode }),
    remountOnSeek: vod ? false : shouldRetryOrRemountHls({ recorded: false }),
    remountOnError: vod ? false : shouldRetryOrRemountHls({ recorded: false }),
    seekToLiveEdge: shouldSeekHlsToLiveEdge({ recorded: vod }),
    cloudflareDvr: isCloudflareStreamHlsUrl(src) && !vod,
    hlsConfig: buildHlsConfig({ cloudflareDvr: isCloudflareStreamHlsUrl(src) && !vod, recorded: vod }),
  };
}

export function cloudflareHlsMountKey({ mode = '', eventId = '' } = {}) {
  const id = String(eventId || 'event');
  if (mode === 'recorded') return `cf-vod-${id}`;
  if (mode === 'live') return `live-${id}`;
  return `cf-${mode || 'idle'}-${id}`;
}

export function vodTimelineSeek({
  currentTime = 0,
  duration = 0,
  expectedDurationSec = 0,
  action = 'drag',
} = {}) {
  const d = Number(expectedDurationSec) > 0 ? Number(expectedDurationSec) : Number(duration);
  const t = Number(currentTime) || 0;
  let target = t;
  if (action === 'backward') target = t - 15;
  else if (action === 'forward') target = t + 15;
  else if (action === 'drag') target = d > 0 ? d * 0.6 : t;
  else target = Number(action) || t;
  return clampVodSeek({
    currentTime: t,
    duration: d,
    target,
    expectedDurationSec: d,
  });
}

export function recordedHlsStartPosition() {
  return 0;
}

export function shouldSeekHlsToLiveEdge({ recorded = false } = {}) {
  return !recorded;
}

/**
 * Play after pause: Cloudflare DVR resumes in place (LIVE button jumps to edge).
 * MediaMTX keeps existing live-edge resume unless the viewer is holding DVR.
 */
export function shouldSeekToLiveEdgeOnResume({
  recorded = false,
  cloudflareDvr = false,
  holdingDvr = false,
} = {}) {
  if (recorded) return false;
  if (cloudflareDvr) return false;
  if (holdingDvr) return false;
  return true;
}

export function shouldRetryOrRemountHls({
  recorded = false,
  atNaturalEnd = false,
  cloudflareSessionEnded = false,
} = {}) {
  if (recorded) return false;
  if (atNaturalEnd) return false;
  if (cloudflareSessionEnded) return false;
  return true;
}

/** Clamp a DVR timeline seek to the available seekable window. */
export function clampDvrSeek({ currentTime = 0, seekableStart = 0, seekableEnd = 0, target } = {}) {
  const t = Number(target);
  const start = Number(seekableStart);
  const end = Number(seekableEnd);
  const cur = Number(currentTime);
  if (!Number.isFinite(t)) return Number.isFinite(cur) ? cur : 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return Number.isFinite(cur) ? cur : 0;
  }
  return Math.min(Math.max(t, start), end);
}

/** LIVE button / jump-to-live target. */
export function liveEdgeSeekTarget({ liveSyncPosition, seekableEnd } = {}) {
  if (Number.isFinite(liveSyncPosition)) return liveSyncPosition;
  if (Number.isFinite(seekableEnd)) return Math.max(0, seekableEnd - 0.25);
  return null;
}

/** Props LivePlayer must pass to HlsPlayer for Cloudflare recorded VOD. */
export function cloudflareRecordedHlsPlayerProps(src) {
  return {
    src: String(src || ''),
    isLive: false,
    recorded: true,
    detectPublish: false,
  };
}

/**
 * HTML5 `ended` or finite duration reached (hls.js VOD sometimes skips `ended`).
 */
export function cloudflareExpectedVodDurationSec(config) {
  const n = Number(config?.cfStreamVideoDurationSec ?? config?.durationSec);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isRecordedVodAtNaturalEnd(video, expectedDurationSec = 0) {
  if (!video) return false;
  return shouldFinishRecordedVod({
    ended: video.ended === true,
    currentTime: video.currentTime,
    duration: video.duration,
    expectedDurationSec,
  });
}

/**
 * Finish only at the real VOD end. A 30s live/DVR window must not count
 * as the end when Cloudflare reports a multi-minute recording.
 */
export function shouldFinishRecordedVod({
  ended = false,
  currentTime = 0,
  duration = NaN,
  expectedDurationSec = 0,
} = {}) {
  const t = Number(currentTime);
  const d = Number(duration);
  const expected = Number(expectedDurationSec);
  const timeOk = Number.isFinite(t) && t >= 0;
  if (Number.isFinite(expected) && expected >= 60 && timeOk && t < expected * 0.5) {
    return false;
  }
  if (ended === true) return true;
  if (!Number.isFinite(d) || d <= 0 || !timeOk) return false;
  return t >= d - 0.35;
}

function eventStatusIsOffline(status) {
  const s = String(status || '').toLowerCase();
  return s === 'ended' || s === 'cancelled' || s === 'offline' || s === 'published' || s === 'draft';
}

function isCloudflareLiveSession(config) {
  if (!config) return false;
  if (config.cfRecordingPreparing === true) return false;
  if (config.playbackMode === 'offline') return false;
  if (config.isPublishing === false) return false;
  // A finite VOD is never live, even if a stale socket left isLive/playbackMode=live.
  if (config.isPublishing !== true && resolveCloudflareRecordedHlsUrl(config)) return false;
  if (config.playbackMode === 'recorded' && config.isPublishing !== true) return false;
  if (eventStatusIsOffline(config.status) && config.isPublishing !== true) return false;
  if (config.isLive === false && config.isPublishing !== true && config.reconnecting !== true) {
    return false;
  }
  const live =
    config.isPublishing === true ||
    ((config.playbackMode === 'live' ||
      config.playbackMode === 'reconnecting' ||
      config.isLive === true) &&
      !eventStatusIsOffline(config.status));
  if (!live) return false;
  const url = String(config.playbackUrl || config.hlsUrl || '').trim();
  if (isFiniteCloudflareVodUrl(url, {
    videoUid: config.cfStreamVideoUid,
    liveInputId: config.cfStreamLiveInputId,
  }) && config.isPublishing !== true) {
    return false;
  }
  return isCloudflareStreamHlsUrl(url) || String(config.liveIngestProvider || '') === 'cloudflare_stream';
}

function isCloudflareIngestConfig(config) {
  if (String(config?.liveIngestProvider || '') === 'cloudflare_stream') return true;
  return isCloudflareStreamHlsUrl(config?.playbackUrl || config?.hlsUrl);
}

function isCloudflareRecordingPreparing(config) {
  if (!config || !isCloudflareIngestConfig(config)) return false;
  if (isCloudflareLiveSession(config)) return false;
  if (resolveCloudflareRecordedHlsUrl(config)) return false;
  const url = String(config.playbackUrl || config.hlsUrl || '').trim();
  if (isCloudflareLiveDvrPlaybackUrl(url, config.cfStreamLiveInputId)) return true;
  if (config.cfRecordingPreparing === true) return true;
  return config.playbackMode === 'offline' || config.isLive === false;
}

export const CLOUDFLARE_RECORDING_PREPARING_MESSAGE = 'Recording is preparing…';
export const LIVE_WAITING_MESSAGE = 'Waiting for live…';

/**
 * Offline Cloudflare events never convert a playback error into "Waiting for live…".
 * HlsPlayer `isLive` is not enough — leftover DVR is still mounted as isLive=true.
 */
export function cloudflarePlaybackErrorUiMode({
  liveIngestProvider = '',
  playbackMode = '',
  isLive = false,
  isPublishing = false,
  cfRecordingPreparing = false,
  recorded = false,
} = {}) {
  if (recorded || playbackMode === 'recorded') return 'recorded';
  const cf =
    String(liveIngestProvider) === 'cloudflare_stream' || cfRecordingPreparing === true;
  const actuallyLive =
    isPublishing === true ||
    (isLive === true &&
      isPublishing !== false &&
      playbackMode !== 'offline' &&
      playbackMode !== 'recorded');
  if (cf && !actuallyLive) return 'recording-preparing';
  if (cfRecordingPreparing === true) return 'recording-preparing';
  return 'waiting-for-live';
}

export function cloudflarePlaybackSourceType(config) {
  const selected = selectCloudflareHlsPlayback({ config });
  if (selected?.mode === 'live') return 'live';
  if (selected?.mode === 'recorded') return 'vod';
  if (selected?.mode === 'recording-preparing') return 'none';
  return 'none';
}

/**
 * Cloudflare live DVR wins while the event is live.
 * Recorded VOD is used only after live ends.
 *
 * @returns {{
 *   mode: 'live' | 'recorded' | 'recording-preparing' | 'waiting-for-live',
 *   src?: string,
 *   isLive: boolean,
 *   cloudflareDvr?: boolean,
 *   hlsPlayer?: { src?: string, isLive: boolean, recorded: boolean, detectPublish: boolean },
 *   startPosition?: number,
 *   seekToLiveEdge?: boolean,
 *   allowBackwardSeek?: boolean,
 *   retryOrRemount?: boolean,
 *   showWaitingForLive?: boolean,
 *   ignoreLiveProbe?: boolean,
 *   ignoreHlsLiveResume?: boolean,
 *   continueLiveStatusPolling: boolean,
 * } | null}
 */
export function selectCloudflareHlsPlayback({
  config,
  hlsLiveResume = false,
  recordedVodEnded = false,
} = {}) {
  const vodSrc = resolveCloudflareRecordedHlsUrl(config);
  const liveIds = {
    videoUid: config?.cfStreamVideoUid,
    liveInputId: config?.cfStreamLiveInputId,
  };

  if (
    recordedVodEnded &&
    config?.isPublishing !== true &&
    isCloudflareIngestConfig(config)
  ) {
    return {
      mode: 'waiting-for-live',
      sourceType: 'none',
      isLive: false,
      recorded: false,
      detectPublish: false,
      showWaitingForLive: true,
      showLiveBadge: false,
      retryOrRemount: false,
      continueLiveStatusPolling: true,
    };
  }

  if (config?.isPublishing === true && isCloudflareLiveSession(config)) {
    const src = resolveCloudflareLiveDvrUrl(config) || resolveServerPlaybackUrl(config);
    if (!isFiniteCloudflareVodUrl(src, liveIds)) {
      return {
        mode: 'live',
        sourceType: 'live',
        src,
        isLive: true,
        recorded: false,
        detectPublish: true,
        cloudflareDvr: true,
        hlsPlayer: { src, isLive: true, recorded: false, detectPublish: true },
        seekToLiveEdge: true,
        allowBackwardSeek: true,
        retryOrRemount: true,
        showWaitingForLive: false,
        showLiveBadge: true,
        continueLiveStatusPolling: true,
      };
    }
  }

  if (vodSrc) {
    const session = resolveHlsPlayerSession({
      src: vodSrc,
      recorded: true,
      isLive: false,
      detectPublish: false,
      ...liveIds,
      mode: 'recorded',
    });
    return {
      mode: 'recorded',
      sourceType: 'vod',
      src: vodSrc,
      isLive: false,
      recorded: true,
      detectPublish: false,
      cloudflareDvr: false,
      expectedDurationSec: cloudflareExpectedVodDurationSec(config),
      hlsPlayer: cloudflareRecordedHlsPlayerProps(vodSrc),
      startPosition: recordedHlsStartPosition(),
      seekToLiveEdge: false,
      playThroughEos: true,
      autoStart: true,
      allowBackwardSeek: true,
      retryOrRemount: false,
      showWaitingForLive: false,
      showLiveBadge: false,
      ignoreLiveProbe: true,
      ignoreHlsLiveResume: true,
      continueLiveStatusPolling: true,
      playerSession: session,
    };
  }

  if (isCloudflareLiveSession(config)) {
    const src = resolveCloudflareLiveDvrUrl(config) || resolveServerPlaybackUrl(config);
    if (isFiniteCloudflareVodUrl(src, liveIds)) {
      const session = resolveHlsPlayerSession({
        src,
        recorded: true,
        isLive: false,
        detectPublish: false,
        ...liveIds,
        mode: 'recorded',
      });
      return {
        mode: 'recorded',
        sourceType: 'vod',
        src: session.recorded ? src : vodSrc,
        isLive: false,
        recorded: true,
        detectPublish: false,
        cloudflareDvr: false,
        hlsPlayer: cloudflareRecordedHlsPlayerProps(src),
        startPosition: recordedHlsStartPosition(),
        seekToLiveEdge: false,
        retryOrRemount: false,
        showWaitingForLive: false,
        showLiveBadge: false,
        continueLiveStatusPolling: true,
        playerSession: session,
      };
    }
    return {
      mode: 'live',
      sourceType: 'live',
      src,
      isLive: true,
      recorded: false,
      detectPublish: true,
      cloudflareDvr: true,
      hlsPlayer: { src, isLive: true, recorded: false, detectPublish: true },
      seekToLiveEdge: true,
      allowBackwardSeek: true,
      retryOrRemount: true,
      showWaitingForLive: false,
      showLiveBadge: true,
      continueLiveStatusPolling: true,
    };
  }

  if (isCloudflareRecordingPreparing(config) || isCloudflareIngestConfig(config)) {
    return {
      mode: 'recording-preparing',
      sourceType: 'none',
      isLive: false,
      showWaitingForLive: false,
      showLiveBadge: false,
      retryOrRemount: false,
      ignoreHlsLiveResume: true,
      continueLiveStatusPolling: true,
    };
  }

  return null;
}
