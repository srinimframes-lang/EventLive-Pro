/**
 * Recording playback helpers: R2 keys, Range requests, signed-URL expiry,
 * playback lifecycle status. Pure functions — safe to unit test.
 */
import path from 'path';

/** Presigned R2 GET lifetime for replay (covers a long ceremony + seeking). */
export const RECORDING_SIGNED_URL_EXPIRES_SEC = 24 * 3600;

export function buildRecordingR2Key(eventId, filename) {
  const id = String(eventId || '').trim();
  const name = path.posix.basename(String(filename || '').replace(/\\/g, '/'));
  if (!id || !name) return '';
  return `recordings/${id}/${name}`;
}

export function sameOriginRecordingPlayUrl(apiOrigin, eventId, partId = '') {
  const origin = String(apiOrigin || '').replace(/\/+$/, '');
  const id = String(eventId || '').trim();
  if (!origin || !id) return '';
  const qs = partId ? `?part=${encodeURIComponent(String(partId))}` : '';
  return `${origin}/api/events/${id}/stream/recording${qs}`;
}

/**
 * Public player lifecycle. Completed recordings are "replay", never "reconnecting".
 */
export function recordingPlaybackStatus({
  isLive = false,
  reconnecting = false,
  hasRecording = false,
  publiclyVisible = false,
  mergeStatus = '',
  storage = 'local',
} = {}) {
  if (isLive && reconnecting) return 'reconnecting';
  if (isLive) return 'live';
  if (hasRecording && (publiclyVisible || storage === 'r2' || storage === 'local')) {
    return 'replay';
  }
  const merge = String(mergeStatus || '');
  if (merge === 'pending') return 'processing';
  return 'unavailable';
}

export function parseByteRange(rangeHeader, size) {
  const sizeN = Math.max(0, Number(size) || 0);
  if (sizeN <= 0) {
    return {
      status: 200,
      start: 0,
      end: 0,
      contentLength: 0,
      contentRange: '',
    };
  }

  const raw = String(rangeHeader || '').trim();
  if (!raw) {
    return {
      status: 200,
      start: 0,
      end: sizeN - 1,
      contentLength: sizeN,
      contentRange: `bytes 0-${sizeN - 1}/${sizeN}`,
    };
  }

  const m = raw.match(/^bytes=(\d*)-(\d*)$/i);
  if (!m) {
    return {
      status: 416,
      start: 0,
      end: 0,
      contentLength: 0,
      contentRange: `bytes */${sizeN}`,
    };
  }

  let start;
  let end;
  if (m[1] === '' && m[2] !== '') {
    const suffix = Number(m[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return {
        status: 416,
        start: 0,
        end: 0,
        contentLength: 0,
        contentRange: `bytes */${sizeN}`,
      };
    }
    start = Math.max(0, sizeN - suffix);
    end = sizeN - 1;
  } else {
    start = Number(m[1] || 0);
    end = m[2] === '' ? sizeN - 1 : Number(m[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= sizeN || end < start) {
    return {
      status: 416,
      start: 0,
      end: 0,
      contentLength: 0,
      contentRange: `bytes */${sizeN}`,
    };
  }

  end = Math.min(end, sizeN - 1);
  const contentLength = end - start + 1;
  return {
    status: 206,
    start,
    end,
    contentLength,
    contentRange: `bytes ${start}-${end}/${sizeN}`,
  };
}

/**
 * AWS/R2 presigned query: X-Amz-Date + X-Amz-Expires.
 * Returns true only when we can prove the URL is past expiry.
 */
export function isSignedUrlExpired(url, { now = Date.now() } = {}) {
  try {
    const u = new URL(String(url || ''), 'https://example.invalid');
    const amzDate = u.searchParams.get('X-Amz-Date');
    const amzExpires = Number(u.searchParams.get('X-Amz-Expires') || 0);
    if (!amzDate || !Number.isFinite(amzExpires) || amzExpires <= 0) return false;
    const m = String(amzDate).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) return false;
    const start = Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6])
    );
    return now >= start + amzExpires * 1000;
  } catch {
    return false;
  }
}

/**
 * Decide local vs R2 vs missing. Never invent an object.
 * r2Head: { exists, size } from HEAD, or null when HEAD was skipped.
 */
export function resolveRecordingPlaybackSource({
  part = null,
  rec = null,
  localExists = false,
  r2Head = null,
} = {}) {
  const r2Key =
    part?.storage === 'r2'
      ? part.r2Key || ''
      : !part && rec?.recordingR2Key
        ? rec.recordingR2Key
        : '';

  if (r2Key) {
    if (r2Head && r2Head.exists === false) {
      if (localExists) {
        return { kind: 'local', r2Key, reason: 'r2-missing-local-fallback' };
      }
      return { kind: 'missing', r2Key, reason: 'r2-missing' };
    }
    return { kind: 'r2', r2Key };
  }

  if (localExists) return { kind: 'local', r2Key: '' };
  return { kind: 'missing', r2Key: '', reason: 'no-source' };
}

export function recordingMediaHeaders({ contentLength, acceptRanges = true } = {}) {
  const headers = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'public, max-age=3600',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };
  if (acceptRanges) headers['Accept-Ranges'] = 'bytes';
  if (contentLength != null && Number.isFinite(Number(contentLength))) {
    headers['Content-Length'] = String(contentLength);
  }
  return headers;
}
