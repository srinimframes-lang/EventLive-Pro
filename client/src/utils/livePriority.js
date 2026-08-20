/**
 * LIVE-priority playback helpers.
 * LIVE HLS always wins over recording parts. Parts are a temporary fallback
 * until LIVE returns (or the event has been offline long enough to treat as replay).
 */

/** Poll stream config this often while showing recording parts (awaiting LIVE resume). */
export const LIVE_PRIORITY_POLL_MS = 3000;

/** After this long offline, treat parts as permanent replay UI (still poll, slower). */
export const TEMP_LIVE_FALLBACK_MS = 30 * 60 * 1000;

const REPLAY_POLL_CONNECTED_MS = 30000;
const REPLAY_POLL_DISCONNECTED_MS = 10000;

function hasPublicRecordings(config) {
  if (!config) return false;
  if (config.recordingUrl) return true;
  return Array.isArray(config.recordings) && config.recordings.length > 0;
}

/**
 * True while we should prefer returning to LIVE over settling on Replay UI.
 * Uses liveEndedAt age — short OBS flaps still get the interrupted / reconnect UX.
 */
export function isTemporaryRecordingFallback(config) {
  if (!config || config.isLive) return false;
  if (!hasPublicRecordings(config)) return false;
  // Active publisher / reconnect grace: parts are a short-lived safety net.
  if (config.reconnecting === true) return true;
  if (config.isPublishing === true) return true;
  // Probed offline, or API already settled on recorded VOD — never reconnect UX.
  if (config.isPublishing === false) return false;
  if (config.playbackMode === 'recorded') return false;
  if (config.status === 'ended' || config.status === 'cancelled') return false;
  const endedAt = config.liveEndedAt ? new Date(config.liveEndedAt).getTime() : NaN;
  if (!Number.isFinite(endedAt) || endedAt <= 0) return false;
  return Date.now() - endedAt < TEMP_LIVE_FALLBACK_MS;
}

/**
 * Poll interval for Watch/Embed stream config refresh.
 * Fast while on parts (LIVE may return); normal cadence while live / idle.
 */
export function livePollIntervalMs(config, { socketConnected = false } = {}) {
  if (config && !config.isLive && hasPublicRecordings(config) && isTemporaryRecordingFallback(config)) {
    return LIVE_PRIORITY_POLL_MS;
  }
  return socketConnected ? REPLAY_POLL_CONNECTED_MS : REPLAY_POLL_DISCONNECTED_MS;
}

/**
 * Merge REST stream config with socket liveStatus.
 * LIVE from either source wins; never keep parts when LIVE is available.
 */
export function mergeLivePriorityConfig(config, liveStatus, failoverState) {
  if (!config) return null;
  const next = { ...config };

  if (liveStatus) {
    if (liveStatus.reconnecting !== undefined) {
      next.reconnecting = Boolean(liveStatus.reconnecting);
    }
    if (liveStatus.playbackMode) {
      next.playbackMode = liveStatus.playbackMode;
    }
    if (liveStatus.recordingUrl !== undefined) {
      next.recordingUrl = liveStatus.recordingUrl || '';
      next.recordingAvailable = Boolean(liveStatus.recordingAvailable);
      if (!liveStatus.playbackMode) {
        next.playbackMode = liveStatus.isLive
          ? liveStatus.reconnecting
            ? 'reconnecting'
            : 'live'
          : liveStatus.recordingUrl
            ? 'recorded'
            : 'offline';
      }
    }
    if (liveStatus.recordings) {
      next.recordings = liveStatus.recordings;
      next.recordingCount = liveStatus.recordingCount ?? liveStatus.recordings.length;
    }
    if (liveStatus.recordingMergeStatus !== undefined) {
      next.recordingMergeStatus = liveStatus.recordingMergeStatus;
    }
    if (liveStatus.liveEndedAt !== undefined) {
      next.liveEndedAt = liveStatus.liveEndedAt;
    }
    if (liveStatus.failoverFeatureEnabled) {
      next.failoverFeatureEnabled = true;
      if (liveStatus.activeSource) next.activeSource = liveStatus.activeSource;
      if (liveStatus.backupStatus) next.backupStatus = liveStatus.backupStatus;
      if (liveStatus.backupYoutubeVideoId !== undefined) {
        next.backupYoutubeVideoId = liveStatus.backupYoutubeVideoId;
      }
      if (liveStatus.failoverPlaybackMode) {
        next.failoverPlaybackMode = liveStatus.failoverPlaybackMode;
      }
      if (liveStatus.emergencyOverride) {
        next.emergencyOverride = liveStatus.emergencyOverride;
      }
    }
  }

  if (failoverState?.failoverFeatureEnabled) {
    next.failoverFeatureEnabled = true;
    next.activeSource = failoverState.activeSource || next.activeSource;
    next.backupStatus = failoverState.backupStatus || next.backupStatus;
    if (failoverState.backupYoutubeVideoId !== undefined) {
      next.backupYoutubeVideoId = failoverState.backupYoutubeVideoId;
    }
  }

  // LIVE has highest priority — poll probe or socket live both win over stale "parts".
  const socketLive = liveStatus?.isLive === true;
  const configLive = config.isLive === true || config.isPublishing === true;
  const isLive = socketLive || configLive;
  next.isLive = isLive;

  if (isLive) {
    next.recordingUrl = '';
    next.recordings = [];
    next.recordingCount = 0;
    next.recordingAvailable = false;
    // Publishing / confirmed live clears reconnect UI. Keep reconnecting only
    // during grace when MediaMTX is not publishing yet.
    const publishing = config.isPublishing === true;
    const socketStillReconnecting = liveStatus?.reconnecting === true;
    const apiStillReconnecting = config.reconnecting === true && !publishing;
    if (publishing || (socketLive && !socketStillReconnecting) || (configLive && !apiStillReconnecting && !socketStillReconnecting)) {
      next.reconnecting = false;
      next.playbackMode = 'live';
    } else if (socketStillReconnecting || apiStillReconnecting) {
      next.reconnecting = true;
      next.playbackMode = 'reconnecting';
    } else {
      next.reconnecting = false;
      next.playbackMode = 'live';
    }
  } else {
    next.reconnecting = false;
  }

  return next;
}

/**
 * Probe LIVE HLS playlist availability (no-store). Used while parts play.
 */
export async function probeLiveHlsPlaylist(url) {
  const src = String(url || '').trim();
  if (!src) return false;
  try {
    const res = await fetch(src, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('#EXTM3U');
  } catch {
    return false;
  }
}
