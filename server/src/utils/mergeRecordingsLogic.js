/**
 * Pure merge-policy helpers. ffmpeg I/O stays in mergeRecordings.js.
 * These decide which segments may be concatenated and when originals may
 * be deleted — never based on ffmpeg exit code alone.
 */
import { isBrowserVideoCodec } from './recordingPlayback.js';

export const MERGE_BLIP_MAX_BYTES = 200_000;
export const MERGE_BLIP_MAX_DURATION_SEC = 8;

const H264_NAMES = new Set(['h264', 'avc1', 'avc3', 'avc']);

export function isH264Codec(codec) {
  return H264_NAMES.has(String(codec || '').trim().toLowerCase());
}

/**
 * Tiny OBS connect blips and any segment without a video track must not be
 * concat input #1 (ffmpeg concat demuxer copies the first file's streams).
 */
export function isQuarantineRecordingBlip({
  hasVideo = false,
  sizeBytes = 0,
  durationSec = 0,
} = {}) {
  if (hasVideo) return false;
  const size = Number(sizeBytes) || 0;
  const dur = Number(durationSec) || 0;
  if (size > 0 && size < MERGE_BLIP_MAX_BYTES) return true;
  if (dur > 0 && dur <= MERGE_BLIP_MAX_DURATION_SEC) return true;
  return !hasVideo;
}

export function selectConcatVideoInputs(probes = []) {
  return (Array.isArray(probes) ? probes : []).filter((row) => {
    if (!row) return false;
    if (isQuarantineRecordingBlip(row)) return false;
    return Boolean(row.hasVideo);
  });
}

export function concatInputsNeedReencode(inputs = []) {
  const list = Array.isArray(inputs) ? inputs : [];
  if (!list.length) return false;
  const videoCodecs = new Set(
    list.map((p) => String(p.videoCodec || '').trim().toLowerCase()).filter(Boolean)
  );
  if ([...videoCodecs].some((c) => !isH264Codec(c))) return true;
  return false;
}

export function isFfprobeMergedVideoOk(probe = {}) {
  if (!probe?.hasVideo) return false;
  const codec = String(probe.videoCodec || '').trim();
  if (!codec) return false;
  return isH264Codec(codec) || isBrowserVideoCodec(codec);
}

export function isValidatedMergedOutput(inspect = {}, ffprobe = null) {
  if (inspect && inspect.incomplete === false && !inspect.hasVideo) return false;
  if (isFfprobeMergedVideoOk(ffprobe) && Number(ffprobe?.durationSec) > 0) return true;
  if (!inspect || inspect.incomplete) return false;
  if (!inspect.hasVideo) return false;
  if (!isBrowserVideoCodec(inspect.videoCodec)) return false;
  if (!(Number(inspect.durationSec) > 0)) return false;
  return true;
}

/**
 * Originals may be deleted only after a validated H.264 merge was uploaded
 * and R2 HEAD matches the expected size.
 */
export function mayDeleteOriginalsAfterValidatedMerge({
  validated = false,
  r2Head = null,
  expectedSize = 0,
} = {}) {
  if (!validated) return { ok: false, reason: 'merge-unvalidated' };
  if (!r2Head?.exists) return { ok: false, reason: 'r2-missing' };
  const remote = Number(r2Head.size || 0);
  const expected = Number(expectedSize || 0);
  if (!Number.isFinite(remote) || remote <= 0) return { ok: false, reason: 'r2-size-invalid' };
  if (!Number.isFinite(expected) || expected <= 0) return { ok: false, reason: 'local-size-invalid' };
  if (remote !== expected) return { ok: false, reason: 'size-mismatch' };
  return { ok: true, reason: 'verified' };
}
