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

const BROWSER_VIDEO_CODECS = new Set(['avc1', 'avc3', 'mp4v']);

export function isBrowserVideoCodec(codec) {
  return BROWSER_VIDEO_CODECS.has(String(codec || '').trim());
}

function readAscii(buf, start, n) {
  return buf.toString('ascii', start, start + n);
}

function inspectMoov(buf, start, end, result) {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = readAscii(buf, off + 4, 4);
    let hdr = 8;
    if (size === 1) {
      if (off + 16 > end) {
        result.incomplete = true;
        break;
      }
      size = Number(buf.readBigUInt64BE(off + 8));
      hdr = 16;
    }
    if (size === 0) size = end - off;
    if (size < 8) break;
    const boxEnd = Math.min(off + size, end);
    if (type === 'trak') result.trackCount += 1;
    if (type === 'hdlr' && off + hdr + 12 <= boxEnd) {
      const handler = readAscii(buf, off + hdr + 8, 4);
      result.handlers.push(handler);
      if (handler === 'vide') result.hasVideo = true;
      if (handler === 'soun') result.hasAudio = true;
    }
    if (type === 'mvhd' && off + hdr + 20 <= boxEnd) {
      const ver = buf[off + hdr];
      const tsOff = off + hdr + (ver === 1 ? 20 : 12);
      if (tsOff + 8 <= boxEnd) {
        const timescale = buf.readUInt32BE(tsOff);
        const duration =
          ver === 1 && tsOff + 12 <= boxEnd
            ? Number(buf.readBigUInt64BE(tsOff + 4))
            : buf.readUInt32BE(tsOff + 4);
        if (timescale > 0) result.durationSec = duration / timescale;
      }
    }
    if (type === 'stsd' && off + hdr + 16 <= boxEnd) {
      const codec = readAscii(buf, off + hdr + 12, 4);
      if (!result.videoCodec && (result.hasVideo || /^(avc|hvc|hev|mp4v)/.test(codec))) {
        result.videoCodec = codec;
      }
      if (!result.audioCodec && /^(mp4a|mp4b|ac-3|ec-3|Opus)/.test(codec)) {
        result.audioCodec = codec;
      }
    }
    const containers = new Set(['trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex']);
    if (containers.has(type)) inspectMoov(buf, off + hdr, boxEnd, result);
    off += size;
    if (off > end) break;
  }
}

/**
 * Parse an MP4 init segment (ftyp + moov). Used to detect audio-only / HEVC
 * files that Chrome cannot play, without downloading the full recording.
 */
export function inspectMp4Init(buf) {
  const result = {
    incomplete: false,
    faststart: false,
    hasVideo: false,
    hasAudio: false,
    videoCodec: '',
    audioCodec: '',
    durationSec: 0,
    moovSize: 0,
    trackCount: 0,
    handlers: [],
    browserPlayable: false,
  };
  if (!buf || buf.length < 8) {
    result.incomplete = true;
    return result;
  }
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let off = 0;
  let moovStart = -1;
  let mdatStart = -1;
  while (off + 8 <= b.length) {
    let size = b.readUInt32BE(off);
    const type = readAscii(b, off + 4, 4);
    let hdr = 8;
    if (size === 1) {
      if (off + 16 > b.length) {
        result.incomplete = true;
        break;
      }
      size = Number(b.readBigUInt64BE(off + 8));
      hdr = 16;
    }
    if (size === 0) size = b.length - off;
    if (size < 8) break;
    if (type === 'moov') {
      moovStart = off;
      result.moovSize = size;
      const moovEnd = off + size;
      if (moovEnd > b.length) {
        result.incomplete = true;
        inspectMoov(b, off + hdr, b.length, result);
        break;
      }
      inspectMoov(b, off + hdr, moovEnd, result);
    }
    if (type === 'mdat' && mdatStart < 0) mdatStart = off;
    off += size;
  }
  result.faststart = moovStart >= 0 && (mdatStart < 0 || moovStart < mdatStart);
  if (!result.videoCodec && result.hasVideo) result.videoCodec = 'unknown';
  if (!result.audioCodec && result.hasAudio) result.audioCodec = 'mp4a';
  result.browserPlayable = Boolean(
    result.hasVideo && isBrowserVideoCodec(result.videoCodec) && !result.incomplete
  );
  return result;
}

export function isMergedRecordingFilename(filename) {
  return /^merged_/i.test(String(filename || '').trim());
}

/**
 * If the active replay is a merged MP4 that Chrome cannot play (no H.264
 * video track), fall back to original timestamped parts that still exist.
 * Never invent parts; existingIds must be verified by HEAD / local stat.
 */
export function selectPlayableRecordingParts({
  active = [],
  all = [],
  inspect = null,
  existingIds = new Set(),
} = {}) {
  const activeList = (Array.isArray(active) ? active : []).filter(Boolean);
  const mergedOnly =
    activeList.length === 1 && isMergedRecordingFilename(activeList[0].filename);
  const playableMerged = Boolean(inspect && inspect.browserPlayable);
  if (!mergedOnly || playableMerged) return activeList;

  const originals = (Array.isArray(all) ? all : []).filter((p) => {
    if (!p) return false;
    if (isMergedRecordingFilename(p.filename)) return false;
    if (Number(p.sizeBytes) > 0 && Number(p.sizeBytes) < 200000) return false;
    const keys = [
      String(p._id || p.id || ''),
      String(p.r2Key || ''),
      String(p.localPath || ''),
      String(p.filename || ''),
    ].filter(Boolean);
    return keys.some((k) => existingIds.has(k));
  });
  originals.sort((a, b) => {
    const ta = new Date(a.startedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.startedAt || b.createdAt || 0).getTime();
    return ta - tb;
  });
  return originals.length ? originals : activeList;
}
