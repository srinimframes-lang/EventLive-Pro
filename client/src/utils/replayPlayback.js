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

export function isMergedReplayFilename(filename) {
  return /^merged_/i.test(String(filename || '').trim());
}

/** Skip an unplayable merged MP4 when original parts are also listed. */
export function firstReplayPartIndex(parts = []) {
  const list = Array.isArray(parts) ? parts : [];
  if (list.length <= 1) return 0;
  const index = list.findIndex((p) => p && !isMergedReplayFilename(p.filename));
  return index >= 0 ? index : 0;
}

/**
 * After a replay media error: retry the same part via the API path once,
 * then advance to the next part. Never enter live reconnect.
 */
export function nextReplayActionAfterError({
  retriedSamePart = false,
  partIndex = 0,
  partCount = 0,
} = {}) {
  if (!retriedSamePart) return 'retry-same-part';
  if (partIndex < Math.max(0, Number(partCount) || 0) - 1) return 'next-part';
  return 'fail';
}
