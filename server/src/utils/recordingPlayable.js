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
  inspectMp4Init,
  isMergedRecordingFilename,
  selectPlayableRecordingParts,
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

export async function inspectRecordingInit(part) {
  const key = cacheKey(part);
  if (key && inspectCache.has(key)) return inspectCache.get(key);

  let result = inspectMp4Init(Buffer.alloc(0));
  try {
    const abs = resolveRecordingAbsolutePath(part?.localPath);
    const localOk = Boolean(abs && fs.existsSync(abs));
    const readRange = async (start, end) => {
      if (localOk) return readLocalRange(abs, start, end);
      if (part?.r2Key) return getR2ObjectRange(part.r2Key, start, end);
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

async function partSourceExists(part) {
  const abs = resolveRecordingAbsolutePath(part?.localPath);
  if (abs && fs.existsSync(abs)) {
    try {
      return fs.statSync(abs).size > 200000;
    } catch {
      return false;
    }
  }
  if (part?.r2Key) {
    try {
      const head = await headR2Object(part.r2Key);
      if (head?.exists && Number(head.size || 0) > 200000) return true;
    } catch {
      /* try localPath candidate below */
    }
  }
  // Render cannot see VPS disks. Keep sizable local leftovers so the
  // recording fallback host (stream.eventlivepro.com) can serve them.
  return Boolean(part?.localPath && Number(part.sizeBytes || 0) > 200000);
}

/**
 * Public/player part list. Falls back to original segments when the merged
 * replay MP4 has no browser-playable video track.
 */
export async function loadPlayableRecordingParts(event) {
  const active = listActiveRecordingParts(event);
  const all = ensureRecordingsArray(event);
  const mergedOnly =
    active.length === 1 && isMergedRecordingFilename(active[0]?.filename);

  let inspect = null;
  if (mergedOnly) {
    try {
      inspect = await inspectRecordingInit(active[0]);
    } catch {
      inspect = { incomplete: true, browserPlayable: false };
    }
  }
  if (!mergedOnly || inspect?.browserPlayable) {
    return active;
  }

  const existingIds = new Set();
  const checks = all.map(async (p) => {
    if (!p || isMergedRecordingFilename(p.filename)) return;
    if (await partSourceExists(p)) {
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
