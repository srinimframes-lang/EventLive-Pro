/**
 * Recording duration resolution.
 *
 * MediaMTX records fMP4 with recordSegmentDuration=24h. The container mvhd
 * (and HTML5 video.duration) often reports ~24h even when the event was much
 * shorter. MTX_SEGMENT_DURATION may also arrive as a Go duration string
 * ("6h2m3s") which naive Number() / awk parse incorrectly.
 *
 * Preferred order (never fabricate a duration):
 *  1. Actual media duration (ffprobe last-pts / stream) when not a 24h ceiling
 *  2. Verified start/end timestamps (filename start + file mtime / endedAt)
 *  3. Existing stored duration only if it looks valid
 */

/** Production MediaMTX pathDefaults.recordSegmentDuration. */
export const MEDIAMTX_DEFAULT_SEGMENT_SEC = 24 * 3600;

/** ±90 min around the 24h segment ceiling (covers leftover fMP4 fragments). */
const SEGMENT_CEILING_SLOP_SEC = 90 * 60;

export function looksLikeSegmentCeilingDuration(
  durationSec,
  { segmentSec = MEDIAMTX_DEFAULT_SEGMENT_SEC } = {}
) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return false;
  return Math.abs(d - (Number(segmentSec) || 0)) <= SEGMENT_CEILING_SLOP_SEC;
}

/**
 * Parse MediaMTX / hook duration values:
 *  - Go time.Duration.String() e.g. "6h2m3.5s", "24h56m31s"
 *  - plain seconds ("21600", 21600)
 *  - nanoseconds if the number is huge
 */
export function parseMediaMtxDurationToSec(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return 0;
    if (raw > 1e15) return Math.round(raw / 1e9); // ns
    if (raw > 1e12) return Math.round(raw / 1e9); // ns
    return Math.round(raw);
  }
  const s = String(raw).trim();
  if (!s) return 0;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return parseMediaMtxDurationToSec(Number(s));
  }
  const re = /(-?\d+(?:\.\d+)?)(ns|us|µs|ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(s))) {
    matched = true;
    const n = Number(m[1]);
    const unit = m[2];
    if (unit === 'h') total += n * 3600;
    else if (unit === 'm') total += n * 60;
    else if (unit === 's') total += n;
    else if (unit === 'ms') total += n / 1000;
    else if (unit === 'us' || unit === 'µs') total += n / 1e6;
    else if (unit === 'ns') total += n / 1e9;
  }
  return matched ? Math.max(0, Math.round(total)) : 0;
}

export function durationFromTimestamps(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0;
  const a = new Date(startedAt).getTime();
  const b = new Date(endedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
}

function isPlausibleContentDuration(sec) {
  return Number.isFinite(sec) && sec > 0 && !looksLikeSegmentCeilingDuration(sec);
}

/**
 * Stored duration of a few seconds while timestamps say hours = awk/Number()
 * truncation of a Go duration string ("6h2m" → 6).
 */
export function isImplausiblyShortVersusTimestamps(storedSec, timestampSec) {
  const stored = Number(storedSec) || 0;
  const ts = Number(timestampSec) || 0;
  if (stored <= 0 || ts < 120) return false;
  return stored < 60 && stored < ts * 0.05;
}

/**
 * Resolve a duration to expose to the player / API.
 * Returns 0 when nothing trustworthy is available (do not invent).
 */
export function resolveTrustedDurationSec({
  mediaDurationSec = 0,
  containerDurationSec = 0,
  storedDurationSec = 0,
  startedAt = null,
  endedAt = null,
  fileMtime = null,
} = {}) {
  const media = Math.max(0, Math.round(Number(mediaDurationSec) || 0));
  const container = Math.max(0, Math.round(Number(containerDurationSec) || 0));
  const stored = Math.max(0, Math.round(Number(storedDurationSec) || 0));
  const mtimeDur = durationFromTimestamps(startedAt, fileMtime);
  const endDur = durationFromTimestamps(startedAt, endedAt);

  let ts = 0;
  if (isPlausibleContentDuration(mtimeDur)) ts = mtimeDur;
  else if (isPlausibleContentDuration(endDur)) ts = endDur;
  else ts = isPlausibleContentDuration(mtimeDur)
    ? mtimeDur
    : isPlausibleContentDuration(endDur)
      ? endDur
      : 0;

  if (isPlausibleContentDuration(media)) return media;
  if (ts > 0) {
    if (isImplausiblyShortVersusTimestamps(stored, ts)) return ts;
    if (isImplausiblyShortVersusTimestamps(container, ts)) return ts;
    return ts;
  }
  if (isPlausibleContentDuration(stored) && !isImplausiblyShortVersusTimestamps(stored, endDur || mtimeDur)) {
    return stored;
  }
  if (isPlausibleContentDuration(container)) return container;

  const ceiling = [media, container, stored].find((d) => d > 0) || 0;
  const rawTs = isPlausibleContentDuration(mtimeDur)
    ? mtimeDur
    : isPlausibleContentDuration(endDur)
      ? endDur
      : durationFromTimestamps(startedAt, fileMtime) || durationFromTimestamps(startedAt, endedAt);
  if (rawTs > 0 && ceiling > 0 && rawTs < ceiling * 0.85) return rawTs;
  if (rawTs > 0) return rawTs;
  if (stored > 0) return stored;
  if (container > 0) return container;
  if (media > 0) return media;
  return 0;
}

/**
 * Player clock: prefer the media element's duration when it is finite and
 * not an inflated 24h fMP4 ceiling compared with a trusted value.
 */
export function pickPlayerDurationSec(mediaDurationSec, trustedDurationSec) {
  const trusted = Math.max(0, Number(trustedDurationSec) || 0);
  const media = Number(mediaDurationSec);
  const mediaOk = Number.isFinite(media) && media > 0;
  if (mediaOk && trusted > 0) {
    if (looksLikeSegmentCeilingDuration(media) && trusted < media * 0.85) return trusted;
    if (media > trusted * 1.25 && trusted >= 30) return trusted;
    return media;
  }
  if (mediaOk) return media;
  return trusted;
}

export function partTrustedDurationSec(part = {}) {
  return resolveTrustedDurationSec({
    storedDurationSec: part.durationSec,
    startedAt: part.startedAt,
    endedAt: part.endedAt || part.createdAt,
    fileMtime: part.fileMtime || null,
  });
}
