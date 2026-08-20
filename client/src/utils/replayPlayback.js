/**
 * Replay / VOD helpers. Completed recordings must never use live reconnect UX.
 */

export function clampReplaySeek({ saved, trustedDurationSec = 0, videoDuration = 0 } = {}) {
  const s = Number(saved);
  if (!Number.isFinite(s) || s < 1) return 0;
  const trusted = Math.max(0, Number(trustedDurationSec) || 0);
  const raw = Number.isFinite(videoDuration) ? Number(videoDuration) : 0;
  let cap = raw > 0 ? raw : 0;
  if (trusted > 0 && (cap <= 0 || cap > trusted * 1.25)) cap = trusted;
  if (!(cap > 1)) return 0;
  if (s >= cap - 0.5) return 0;
  return s;
}

export function shouldRestoreReplaySeek({
  readyState = 0,
  videoWidth = 0,
  saved = 0,
  trustedDurationSec = 0,
  videoDuration = 0,
} = {}) {
  if (readyState < 2) return false;
  if (!(Number(videoWidth) > 0)) return false;
  return clampReplaySeek({ saved, trustedDurationSec, videoDuration }) > 0;
}

export function isReplayVodState({ playbackMode, reconnecting, isLive } = {}) {
  if (isLive) return false;
  if (reconnecting) return false;
  return playbackMode === 'recorded' || playbackMode === 'replay';
}
