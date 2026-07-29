import { extractYouTubeId } from './youtube.js';

/** Health poll interval (ms). */
export const FAILOVER_CHECK_INTERVAL_MS = 10_000;
/** Consecutive failed checks before declaring server DOWN (~60s). */
export const FAILOVER_FAIL_THRESHOLD = 6;
/** Consecutive OK checks before notifying Super Admin of recovery. */
export const FAILOVER_RECOVER_THRESHOLD = 3;

/**
 * Resolve which source the player should use.
 * When feature flag is off, callers must not override the existing player path.
 *
 * @param {object} event
 * @param {{ failoverEnabled?: boolean }} [opts]
 * @returns {'server'|'youtube'}
 */
export function resolveActiveSource(event, { failoverEnabled = false } = {}) {
  if (!failoverEnabled) return 'server';

  const emergency = event?.emergencyOverride || {};
  if (emergency.enabled) {
    if (emergency.mode === 'force_youtube') return 'youtube';
    if (emergency.mode === 'force_server' || emergency.mode === 'disabled') return 'server';
  }

  const mode = event?.playbackMode || 'auto';
  if (mode === 'force_youtube') return 'youtube';
  if (mode === 'force_server') return 'server';

  // Auto: stay on YouTube after failover until Super Admin switches back.
  if (
    event?.backupStreamEnabled &&
    (event?.backupStatus === 'active' || event?.backupStatus === 'server_recovered')
  ) {
    return 'youtube';
  }

  return 'server';
}

/**
 * Backup YouTube id for failover playback (never invents from primary youtube
 * when primary is a server stream — use dedicated backup field).
 */
export function resolveBackupYoutubeId(event) {
  return (
    extractYouTubeId(event?.backupYoutubeVideoId || '') ||
    extractYouTubeId(event?.youtubeVideoId || '') ||
    ''
  );
}

/**
 * Whether this event is eligible for automatic failover monitoring.
 */
export function isFailoverCandidate(event, { failoverEnabled = false } = {}) {
  if (!failoverEnabled) return false;
  if (!event?.backupStreamEnabled) return false;
  if (event.streamProvider !== 'rtmp' && event.streamProvider !== 'hls') return false;
  if (event.streamDisabled) return false;
  if (!event.isLive) return false;
  if (event.emergencyOverride?.mode === 'disabled') return false;
  if (event.emergencyOverride?.enabled && event.emergencyOverride?.mode === 'force_server') {
    return false;
  }
  if (event.playbackMode === 'force_server') return false;
  const backupId = resolveBackupYoutubeId(event);
  return Boolean(backupId);
}

/**
 * Probe a public HLS playlist URL.
 * @returns {Promise<boolean>}
 */
export async function probeHlsPlaylist(url, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!url) return false;
  try {
    const res = await fetchImpl(String(url), {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*',
      },
    });
    if (!res.ok) return false;
    const text = await res.text();
    return String(text || '').includes('#EXTM3U');
  } catch {
    return false;
  }
}

/**
 * Combine HLS playlist + MediaMTX publishing probe into a single health verdict.
 *
 * @param {{ playlistOk: boolean, publishing: boolean|null }} parts
 * @returns {{ healthy: boolean, reason: string }}
 */
export function evaluateStreamHealth({ playlistOk, publishing }) {
  if (!playlistOk) {
    return { healthy: false, reason: 'hls_playlist_unavailable' };
  }
  // publishing === false means MediaMTX reports path not ready.
  if (publishing === false) {
    return { healthy: false, reason: 'mediamtx_path_not_ready' };
  }
  // publishing === null (API unreachable) — trust public HLS when playlist is OK.
  return { healthy: true, reason: publishing === true ? 'ok' : 'ok_hls_only' };
}

/**
 * Apply one health sample to counters / status (pure; returns patch).
 *
 * @param {object} event Snapshot of current failover fields
 * @param {{ healthy: boolean, reason?: string, now?: Date }} sample
 */
export function applyHealthSample(event, { healthy, reason = '', now = new Date() }) {
  const failThreshold = FAILOVER_FAIL_THRESHOLD;
  const recoverThreshold = FAILOVER_RECOVER_THRESHOLD;
  const prevFails = Number(event?.streamHealth?.consecutiveFailures) || 0;
  const prevOk = Number(event?.streamHealth?.consecutiveSuccesses) || 0;
  const backupStatus = event?.backupStatus || 'idle';
  const playbackMode = event?.playbackMode || 'auto';

  const patch = {
    streamHealth: {
      consecutiveFailures: healthy ? 0 : prevFails + 1,
      consecutiveSuccesses: healthy ? prevOk + 1 : 0,
      lastCheckedAt: now,
      lastHealthyAt: healthy ? now : event?.streamHealth?.lastHealthyAt || null,
      lastFailoverAt: event?.streamHealth?.lastFailoverAt || null,
      lastError: healthy ? '' : reason || 'unhealthy',
    },
    backupStatus,
    playbackMode,
    transition: null, // 'failover' | 'recovered' | null
  };

  if (!healthy) {
    if (
      patch.streamHealth.consecutiveFailures >= failThreshold &&
      backupStatus !== 'active' &&
      backupStatus !== 'server_recovered' &&
      playbackMode === 'auto'
    ) {
      patch.backupStatus = 'active';
      patch.streamHealth.lastFailoverAt = now;
      patch.transition = 'failover';
    } else if (backupStatus === 'idle' || backupStatus === 'monitoring') {
      patch.backupStatus = 'monitoring';
    }
    return patch;
  }

  // Healthy
  if (backupStatus === 'active' && patch.streamHealth.consecutiveSuccesses >= recoverThreshold) {
    patch.backupStatus = 'server_recovered';
    patch.transition = 'recovered';
  } else if (backupStatus === 'idle' || backupStatus === 'monitoring') {
    patch.backupStatus = event?.backupStreamEnabled ? 'monitoring' : 'idle';
  }
  // server_recovered / active while still on YouTube: keep status until admin acts
  return patch;
}

/**
 * Public-safe failover slice for stream config responses.
 * Returns null when feature is disabled so callers can omit the block.
 */
export function publicFailoverSlice(event, { failoverEnabled = false } = {}) {
  if (!failoverEnabled) return null;

  const activeSource = resolveActiveSource(event, { failoverEnabled: true });
  const backupYoutubeVideoId = resolveBackupYoutubeId(event);

  return {
    failoverFeatureEnabled: true,
    backupStreamEnabled: Boolean(event.backupStreamEnabled),
    backupYoutubeVideoId:
      activeSource === 'youtube' || event.backupStreamEnabled ? backupYoutubeVideoId : '',
    backupStatus: event.backupStatus || 'idle',
    // Named distinctly from existing stream config playbackMode (live|recorded|offline).
    failoverPlaybackMode: event.playbackMode || 'auto',
    primaryStream: event.primaryStream || 'server',
    activeSource,
    streamHealth: {
      consecutiveFailures: Number(event.streamHealth?.consecutiveFailures) || 0,
      lastCheckedAt: event.streamHealth?.lastCheckedAt || null,
      lastHealthyAt: event.streamHealth?.lastHealthyAt || null,
    },
    emergencyOverride: {
      enabled: Boolean(event.emergencyOverride?.enabled),
      mode: event.emergencyOverride?.mode || 'none',
    },
  };
}

/**
 * Apply a Super Admin emergency action. Returns mutated field patch + transition.
 *
 * @param {object} event
 * @param {string} action
 * @param {{ userId?: string, now?: Date }} [opts]
 */
export function applyEmergencyAction(event, action, { userId = null, now = new Date() } = {}) {
  const a = String(action || '').trim().toLowerCase();
  const patch = {
    playbackMode: event.playbackMode || 'auto',
    backupStatus: event.backupStatus || 'idle',
    emergencyOverride: {
      enabled: Boolean(event.emergencyOverride?.enabled),
      mode: event.emergencyOverride?.mode || 'none',
      updatedBy: userId,
      updatedAt: now,
    },
    streamHealth: {
      consecutiveFailures: Number(event.streamHealth?.consecutiveFailures) || 0,
      consecutiveSuccesses: Number(event.streamHealth?.consecutiveSuccesses) || 0,
      lastCheckedAt: event.streamHealth?.lastCheckedAt || null,
      lastHealthyAt: event.streamHealth?.lastHealthyAt || null,
      lastFailoverAt: event.streamHealth?.lastFailoverAt || null,
      lastError: event.streamHealth?.lastError || '',
    },
    transition: null,
  };

  switch (a) {
    case 'force_server':
      patch.playbackMode = 'force_server';
      patch.emergencyOverride.enabled = true;
      patch.emergencyOverride.mode = 'force_server';
      patch.backupStatus = 'monitoring';
      patch.streamHealth.consecutiveFailures = 0;
      patch.transition = 'force_server';
      break;
    case 'force_youtube':
      patch.playbackMode = 'force_youtube';
      patch.emergencyOverride.enabled = true;
      patch.emergencyOverride.mode = 'force_youtube';
      patch.backupStatus = 'active';
      patch.transition = 'force_youtube';
      break;
    case 'override':
    case 'emergency_override':
      patch.emergencyOverride.enabled = true;
      if (patch.emergencyOverride.mode === 'none') {
        patch.emergencyOverride.mode = 'force_youtube';
        patch.playbackMode = 'force_youtube';
        patch.backupStatus = 'active';
      }
      patch.transition = 'override';
      break;
    case 'disable':
    case 'emergency_disable':
      patch.emergencyOverride.enabled = true;
      patch.emergencyOverride.mode = 'disabled';
      patch.playbackMode = 'force_server';
      patch.backupStatus = 'disabled';
      patch.transition = 'disabled';
      break;
    case 'enable':
    case 'emergency_enable':
      patch.emergencyOverride.enabled = false;
      patch.emergencyOverride.mode = 'none';
      patch.playbackMode = 'auto';
      patch.backupStatus = event.backupStreamEnabled ? 'monitoring' : 'idle';
      patch.streamHealth.consecutiveFailures = 0;
      patch.streamHealth.consecutiveSuccesses = 0;
      patch.transition = 'enabled';
      break;
    case 'continue_youtube':
      // Stay on YouTube after recovery notice; clear recovered flag → active.
      patch.playbackMode = 'force_youtube';
      patch.backupStatus = 'active';
      patch.emergencyOverride.enabled = true;
      patch.emergencyOverride.mode = 'force_youtube';
      patch.transition = 'continue_youtube';
      break;
    case 'switch_server':
      patch.playbackMode = 'force_server';
      patch.backupStatus = 'monitoring';
      patch.emergencyOverride.enabled = true;
      patch.emergencyOverride.mode = 'force_server';
      patch.streamHealth.consecutiveFailures = 0;
      patch.streamHealth.consecutiveSuccesses = 0;
      patch.transition = 'switch_server';
      break;
    default:
      throw new Error(`Unknown emergency action: ${action}`);
  }

  return patch;
}
