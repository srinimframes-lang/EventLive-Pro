/**
 * Cloudflare live DVR vs recorded-VOD decisions for LivePlayer / HlsPlayer.
 * Live ingest settings stay on the default buildHlsConfig path.
 */
import {
  isCloudflareStreamHlsUrl,
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

export function shouldRetryOrRemountHls({ recorded = false, atNaturalEnd = false } = {}) {
  if (recorded) return false;
  if (atNaturalEnd) return false;
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
export function isRecordedVodAtNaturalEnd(video) {
  if (!video) return false;
  if (video.ended === true) return true;
  const duration = Number(video.duration);
  const t = Number(video.currentTime);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(t) || t < 0) return false;
  return t >= duration - 0.35;
}

function isCloudflareLiveSession(config) {
  if (!config) return false;
  const live =
    config.playbackMode === 'live' ||
    config.playbackMode === 'reconnecting' ||
    config.isLive === true ||
    config.isPublishing === true;
  if (!live) return false;
  const url = String(config.playbackUrl || config.hlsUrl || '').trim();
  return isCloudflareStreamHlsUrl(url);
}

/**
 * Cloudflare live DVR wins while the event is live.
 * Recorded VOD is used only after live ends.
 *
 * @returns {{
 *   mode: 'live' | 'recorded' | 'waiting-for-live',
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
  if (isCloudflareLiveSession(config)) {
    const src = resolveServerPlaybackUrl(config);
    return {
      mode: 'live',
      src,
      isLive: true,
      cloudflareDvr: true,
      hlsPlayer: { src, isLive: true, recorded: false, detectPublish: true },
      seekToLiveEdge: true,
      allowBackwardSeek: true,
      retryOrRemount: true,
      showWaitingForLive: false,
      continueLiveStatusPolling: true,
    };
  }

  const src = resolveCloudflareRecordedHlsUrl(config);

  if (src && !recordedVodEnded) {
    return {
      mode: 'recorded',
      src,
      isLive: false,
      cloudflareDvr: false,
      hlsPlayer: cloudflareRecordedHlsPlayerProps(src),
      startPosition: recordedHlsStartPosition(),
      seekToLiveEdge: false,
      allowBackwardSeek: true,
      retryOrRemount: false,
      showWaitingForLive: false,
      ignoreLiveProbe: false,
      ignoreHlsLiveResume: Boolean(hlsLiveResume),
      continueLiveStatusPolling: true,
    };
  }

  if (src && recordedVodEnded) {
    return {
      mode: 'waiting-for-live',
      isLive: false,
      showWaitingForLive: true,
      retryOrRemount: false,
      ignoreHlsLiveResume: true,
      continueLiveStatusPolling: true,
    };
  }

  return null;
}
