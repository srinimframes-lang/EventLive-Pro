/**
 * Resolve a browser-playable recording part list.
 * If ffmpeg concat dropped the video track from a merged MP4, fall back to
 * original parts that still exist on R2 or local disk. Never deletes objects.
 */
import fs from 'fs';
import {
  ensureRecordingsArray,
  listActiveRecordingParts,
  resolveRecordingAbsolutePath,
} from './recording.js';
import { getR2ObjectRange, headR2Object } from './r2.js';
import {
  candidateRecordingR2Keys,
  inspectMp4Init,
  isMergedRecordingFilename,
  selectPlayableRecordingParts,
  shouldPreferMergedRecording,
} from './recordingPlayback.js';

const inspectCache = new Map();
const INIT_PROBE_BYTES = 64;
const INIT_MAX_BYTES = 8 * 1024 * 1024;

function cacheKey(part) {
  return String(part?.r2Key || part?.localPath || part?.filename || '');
}

async function readLocalRange(abs, start, end) {
  const fd = fs.openSync(abs, 'r');
  try {
    const len = end - start + 1;
    const buf = Buffer.alloc(len);
    const { bytesRead } = fs.readSync(fd, buf, 0, len, start);
    return buf.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

export async function inspectRecordingInit(part, eventId = '') {
  const key = cacheKey(part);
  if (key && inspectCache.has(key)) return inspectCache.get(key);

  let result = inspectMp4Init(Buffer.alloc(0));
  try {
    const abs = resolveRecordingAbsolutePath(part?.localPath);
    const localOk = Boolean(abs && fs.existsSync(abs));
    const r2Keys = candidateRecordingR2Keys({ part, eventId });
    const readRange = async (start, end) => {
      if (localOk) return readLocalRange(abs, start, end);
      for (const r2Key of r2Keys) {
        try {
          const buf = await getR2ObjectRange(r2Key, start, end);
          if (buf?.length) return buf;
        } catch {
          /* try next key */
        }
      }
      return Buffer.alloc(0);
    };

    const head = await readRange(0, INIT_PROBE_BYTES - 1);
    const first = inspectMp4Init(head);
    let buf = head;
    if (first.moovSize > 0) {
      const need = Math.min(INIT_MAX_BYTES, 28 + first.moovSize);
      if (head.length < need) {
        buf = await readRange(0, need - 1);
      }
    }
    result = inspectMp4Init(buf);
  } catch (err) {
    result = {
      ...inspectMp4Init(Buffer.alloc(0)),
      incomplete: true,
      error: String(err?.message || err),
    };
  }

  if (key) inspectCache.set(key, result);
  return result;
}

export async function partSourceExists(part, eventId = '') {
  const abs = resolveRecordingAbsolutePath(part?.localPath);
  if (abs && fs.existsSync(abs)) {
    try {
      return fs.statSync(abs).size > 200000;
    } catch {
      return false;
    }
  }
  const keys = candidateRecordingR2Keys({ part, eventId });
  for (const key of keys) {
    try {
      const head = await headR2Object(key);
      if (head?.exists && Number(head.size || 0) > 200000) return true;
    } catch {
      /* try next key */
    }
  }
  // Render cannot see VPS disks. Mongo localPath + sizeBytes is NOT proof.
  return false;
}

export async function probeRecordingR2Source(part, { eventId = '', rec = null } = {}) {
  const keys = candidateRecordingR2Keys({ part, rec, eventId });
  if (!keys.length) return { key: '', head: null };
  let sawMiss = false;
  for (const key of keys) {
    try {
      const head = await headR2Object(key);
      if (head?.exists && Number(head.size || 0) > 0) return { key, head };
      if (head && head.exists === false) sawMiss = true;
    } catch {
      /* try next key */
    }
  }
  return { key: keys[0], head: sawMiss ? { exists: false, size: 0 } : null };
}

/**
 * Public/player part list. Falls back to original segments when the merged
 * replay MP4 has no browser-playable video track.
 */
export async function loadPlayableRecordingParts(event) {
  const active = listActiveRecordingParts(event);
  const all = ensureRecordingsArray(event);
  const eventId = String(event?.id || event?._id || '');
  const merged = active.filter((p) => isMergedRecordingFilename(p.filename));

  let inspect = null;
  if (merged.length) {
    try {
      inspect = await inspectRecordingInit(merged[0], eventId);
    } catch {
      inspect = { incomplete: true, browserPlayable: false };
    }
    if (shouldPreferMergedRecording(inspect, merged[0])) return merged;
  }
  if (!merged.length) return active;

  const existingIds = new Set();
  const checks = all.map(async (p) => {
    if (!p || isMergedRecordingFilename(p.filename)) return;
    if (await partSourceExists(p, eventId)) {
      if (p._id || p.id) existingIds.add(String(p._id || p.id));
      if (p.r2Key) existingIds.add(String(p.r2Key));
      if (p.localPath) existingIds.add(String(p.localPath));
      if (p.filename) existingIds.add(String(p.filename));
    }
  });
  await Promise.all(checks);

  return selectPlayableRecordingParts({
    active,
    all,
    inspect,
    existingIds,
  });
}

export function findPartInList(parts, partId) {
  if (!partId) return parts?.[0] || null;
  const id = String(partId);
  return (
    (parts || []).find((p) => p && String(p._id || p.id) === id) ||
    parts?.[0] ||
    null
  );
}

/**
 * Re-expose leftover original parts so hosts still running older playback
 * code (VPS) can find them. Never deletes recordings, R2 objects, or parts.
 */
export function restoreSoftDeletedPlayableParts(event, playableParts = []) {
  const ids = new Set(
    (playableParts || [])
      .map((p) => String(p?._id || p?.id || ''))
      .filter(Boolean)
  );
  if (!ids.size) return false;
  let changed = false;
  for (const p of ensureRecordingsArray(event)) {
    if (!p?.deletedAt) continue;
    if (isMergedRecordingFilename(p.filename)) continue;
    if (!ids.has(String(p._id || p.id || ''))) continue;
    p.deletedAt = null;
    changed = true;
  }
  return changed;
}

export async function persistPlayableRecordingParts(event) {
  const playable = await loadPlayableRecordingParts(event);
  if (!restoreSoftDeletedPlayableParts(event, playable)) return playable;
  if (typeof event.markModified === 'function') event.markModified('recordings');
  if (typeof event.save === 'function') await event.save();
  return playable;
}
