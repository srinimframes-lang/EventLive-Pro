/**
 * Retry-safe recording upload to Cloudflare R2 and verified local-file cleanup.
 * R2 is permanent storage. Local VPS files are temporary and deleted only after
 * HEAD + size verification. Never deletes storage='local' or unmapped files.
 */
import fs from 'fs';
import path from 'path';
import { Event } from '../models/Event.js';
import {
  listActiveRecordingParts,
  markRecordingPartUploaded,
  RECORDINGS_ROOT,
  resolveRecordingAbsolutePath,
} from './recording.js';
import { headR2Object, isR2Configured, uploadRecordingToR2 } from './r2.js';

export const RECORDING_R2_SWEEP_MS = Math.max(
  10 * 60 * 1000,
  Number(process.env.RECORDING_R2_SWEEP_MS) || 60 * 60 * 1000
);
export const RECORDING_R2_UPLOAD_RETRIES = Math.max(
  1,
  Number(process.env.RECORDING_R2_UPLOAD_RETRIES) || 3
);
export const RECORDING_R2_MIN_AGE_MS = Math.max(
  0,
  Number(process.env.RECORDING_R2_MIN_AGE_MS) || 120_000
);

const inflightUploads = new Map();
const retriggerUploads = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryBackoffMs(attempt) {
  if (attempt <= 1) return 2000;
  if (attempt === 2) return 8000;
  return 32000;
}

function eventIdOf(event) {
  return String(event?.id || event?._id || '');
}

export function isUnsafeRecordingRelPath(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  if (!rel) return true;
  const base = path.posix.basename(rel).toLowerCase();
  if (base.startsWith('.')) return true;
  if (base.endsWith('.tmp') || base.endsWith('.tmp.mp4') || base.includes('.tmp.')) return true;
  if (rel.split('/').includes('.merge-work')) return true;
  return false;
}

export function isRecentRecordingFile(mtimeMs, now = Date.now(), minAgeMs = RECORDING_R2_MIN_AGE_MS) {
  if (!mtimeMs) return true;
  return now - Number(mtimeMs) < minAgeMs;
}

/**
 * Decide whether a local file may be deleted after R2 HEAD.
 * Never true for storage='local' or missing/mismatched R2 objects.
 */
export function shouldUnlinkLocalAfterR2({
  storage,
  r2Key,
  head,
  localSize,
  mapped = true,
} = {}) {
  if (!mapped) return { ok: false, reason: 'unmapped' };
  if (storage !== 'r2') return { ok: false, reason: 'storage-local' };
  if (!r2Key) return { ok: false, reason: 'no-r2-key' };
  if (!head?.exists) return { ok: false, reason: 'r2-missing' };
  const remoteSize = Number(head.size || 0);
  if (!Number.isFinite(remoteSize) || remoteSize <= 0) return { ok: false, reason: 'r2-size-invalid' };
  const local = Number(localSize || 0);
  if (!Number.isFinite(local) || local <= 0) return { ok: false, reason: 'local-size-invalid' };
  if (remoteSize !== local) return { ok: false, reason: 'size-mismatch' };
  return { ok: true, reason: 'verified' };
}

export function matchPartForLocalFile(event, absPath) {
  const abs = resolveRecordingAbsolutePath(absPath);
  if (!abs) return null;
  const filename = path.basename(abs);
  const parts = listActiveRecordingParts(event);
  const byPath = parts.find(
    (p) => p.localPath && resolveRecordingAbsolutePath(p.localPath) === abs
  );
  if (byPath) return byPath;
  const byName = parts.find((p) => p.filename && p.filename === filename);
  if (byName) return byName;
  const byKey = parts.find((p) => p.r2Key && p.r2Key.endsWith(`/${filename}`));
  if (byKey) return byKey;
  if (event.recordingR2Key && path.basename(event.recordingR2Key) === filename) {
    return {
      storage: event.recordingStorage,
      r2Key: event.recordingR2Key,
      filename: event.recordingFilename || filename,
      localPath: event.recordingPath || abs,
    };
  }
  return null;
}

export function listPendingLocalParts(event, { existsFn = fs.existsSync } = {}) {
  const parts = listActiveRecordingParts(event);
  const pending = [];
  for (const part of parts) {
    const abs = resolvePartLocalFile(event, part, existsFn);
    if (!abs) continue;
    if (part.storage === 'r2' && part.r2Key) continue;
    pending.push({ part, abs });
  }
  return pending;
}

function resolvePartLocalFile(event, part, existsFn = fs.existsSync) {
  if (part?.localPath) {
    const abs = resolveRecordingAbsolutePath(part.localPath);
    if (abs && existsFn(abs)) return abs;
  }
  if (part?.filename && event.recordingPath) {
    const abs = resolveRecordingAbsolutePath(event.recordingPath);
    if (abs && path.basename(abs) === part.filename && existsFn(abs)) return abs;
  }
  if (part?.filename && eventIdOf(event)) {
    const candidate = path.join(RECORDINGS_ROOT, eventIdOf(event), part.filename);
    const abs = resolveRecordingAbsolutePath(candidate);
    if (abs && existsFn(abs)) return abs;
  }
  return null;
}

function defaultLocalStat(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

function unlinkLocalFile(abs) {
  fs.unlinkSync(abs);
}

/**
 * Re-HEAD R2, then delete the local file only when object exists and sizes match.
 */
export async function safeUnlinkLocalAfterR2(
  { localPath, r2Key, expectedLocalSize, storage = 'r2' },
  {
    headFn = headR2Object,
    unlinkFn = unlinkLocalFile,
    existsFn = fs.existsSync,
    statFn = defaultLocalStat,
  } = {}
) {
  const abs = resolveRecordingAbsolutePath(localPath);
  if (!abs) {
    console.log(`[r2] cleanup skipped unmapped path: ${localPath || '(empty)'}`);
    return { ok: false, reason: 'unmapped' };
  }
  if (!existsFn(abs)) {
    console.log(`[r2] cleanup skipped already gone: ${abs}`);
    return { ok: true, reason: 'already-gone' };
  }

  let localSize = Number(expectedLocalSize || 0);
  const st = statFn(abs);
  if (st) localSize = st.size;

  let head;
  try {
    head = await headFn(r2Key);
  } catch (err) {
    console.log(`[r2] cleanup skipped HEAD failed for ${r2Key}: ${err.message}`);
    return { ok: false, reason: 'head-failed' };
  }

  const decision = shouldUnlinkLocalAfterR2({
    storage,
    r2Key,
    head,
    localSize,
    mapped: true,
  });
  if (!decision.ok) {
    console.log(`[r2] cleanup skipped ${decision.reason}: ${abs} key=${r2Key || ''}`);
    return { ok: false, reason: decision.reason };
  }

  try {
    unlinkFn(abs);
    console.log(`[r2] local copy removed: ${abs}`);
    return { ok: true, reason: 'removed' };
  } catch (err) {
    console.log(`[r2] cleanup skipped unlink failed ${abs}: ${err.message}`);
    return { ok: false, reason: 'unlink-failed' };
  }
}

/**
 * After a merged R2 object is verified, remove original local part files.
 * Does not require each original to still exist on R2 (merged object replaces them).
 */
export async function unlinkOriginalsReplacedByMergedR2(
  localPaths,
  { mergedR2Key, mergedSize },
  { headFn = headR2Object, unlinkFn = unlinkLocalFile, existsFn = fs.existsSync } = {}
) {
  let head;
  try {
    head = await headFn(mergedR2Key);
  } catch (err) {
    console.log(`[r2] cleanup skipped HEAD failed for merged ${mergedR2Key}: ${err.message}`);
    return { ok: false, reason: 'head-failed', removed: 0 };
  }
  if (!head?.exists || Number(head.size || 0) !== Number(mergedSize || 0) || head.size <= 0) {
    console.log(`[r2] cleanup skipped merged R2 not verified: ${mergedR2Key}`);
    return { ok: false, reason: 'merged-unverified', removed: 0 };
  }

  let removed = 0;
  for (const localPath of localPaths || []) {
    const abs = resolveRecordingAbsolutePath(localPath);
    if (!abs) {
      console.log(`[r2] cleanup skipped unmapped original: ${localPath || '(empty)'}`);
      continue;
    }
    if (!existsFn(abs)) continue;
    try {
      unlinkFn(abs);
      console.log(`[r2] local copy removed: ${abs}`);
      removed += 1;
    } catch (err) {
      console.log(`[r2] cleanup skipped unlink failed ${abs}: ${err.message}`);
    }
  }
  return { ok: true, reason: 'replaced-by-merged', removed };
}

export async function uploadOneLocalPart(
  event,
  part,
  abs,
  {
    retries = RECORDING_R2_UPLOAD_RETRIES,
    uploadFn = uploadRecordingToR2,
    headFn = headR2Object,
    sleepFn = sleep,
    now = Date.now(),
    statFn = defaultLocalStat,
    unlinkFn = unlinkLocalFile,
    existsFn = fs.existsSync,
  } = {}
) {
  const st = statFn(abs);
  if (!st || st.size <= 0) {
    console.log(`[r2] cleanup skipped local invalid: ${abs}`);
    return { ok: false, skipped: true, reason: 'local-invalid' };
  }
  if (isRecentRecordingFile(st.mtimeMs, now)) {
    console.log(`[r2] cleanup skipped too recent: ${abs}`);
    return { ok: false, skipped: true, reason: 'too-recent' };
  }

  const filename = path.basename(abs);
  const key = `recordings/${eventIdOf(event)}/${filename}`;
  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      console.log(`[r2] upload started ${abs} -> ${key} (attempt ${attempt}/${retries})`);
      const { url, size } = await uploadFn(abs, key);
      const head = await headFn(key);
      if (!head?.exists || Number(head.size || 0) !== Number(size || 0) || head.size <= 0) {
        throw new Error(
          `R2 HEAD mismatch for ${key}: remote ${head?.size || 0} vs uploaded ${size}`
        );
      }
      console.log(`[r2] upload verified (${size} bytes): ${key}`);

      markRecordingPartUploaded(event, {
        filename,
        localPath: abs,
        r2Key: key,
        r2Url: url,
        sizeBytes: size,
      });
      if (typeof event.save === 'function') await event.save();

      await safeUnlinkLocalAfterR2(
        { localPath: abs, r2Key: key, expectedLocalSize: size, storage: 'r2' },
        { headFn, unlinkFn, existsFn, statFn }
      );
      return { ok: true, key, size };
    } catch (err) {
      lastErr = err;
      console.error(
        `[r2] upload failed ${abs} -> ${key} (attempt ${attempt}/${retries}): ${err.message}`
      );
      if (attempt < retries) await sleepFn(retryBackoffMs(attempt));
    }
  }
  return { ok: false, error: lastErr };
}

export async function uploadAllPendingLocalParts(
  eventId,
  { loadEvent, retries = RECORDING_R2_UPLOAD_RETRIES, ...hooks } = {}
) {
  if (!isR2Configured() && !hooks.uploadFn) {
    console.warn('[r2] not configured — recording kept on local disk only');
    return { ok: false, reason: 'r2-not-configured', uploaded: 0 };
  }

  const event = loadEvent
    ? await loadEvent(eventId)
    : await Event.findById(eventId);
  if (!event) return { ok: false, reason: 'event-not-found', uploaded: 0 };

  const pending = listPendingLocalParts(event, {
    existsFn: hooks.existsFn || fs.existsSync,
  });
  if (!pending.length) return { ok: true, reason: 'none-pending', uploaded: 0 };

  let uploaded = 0;
  for (const item of pending) {
    const result = await uploadOneLocalPart(event, item.part, item.abs, {
      retries,
      ...hooks,
    });
    if (result.ok) uploaded += 1;
  }
  return { ok: uploaded > 0 || pending.length === 0, uploaded, pending: pending.length };
}

/** Non-blocking: retry loop + dirty-flag so extra finalize hooks are not dropped. */
export function scheduleEventRecordingUpload(eventId, hooks = {}) {
  if (!isR2Configured() && !hooks.uploadFn) {
    console.warn('[r2] not configured — recording kept on local disk only');
    return;
  }
  const id = String(eventId || '').trim();
  if (!id) return;

  if (inflightUploads.has(id)) {
    retriggerUploads.add(id);
    return inflightUploads.get(id);
  }

  const run = async () => {
    do {
      retriggerUploads.delete(id);
      await uploadAllPendingLocalParts(id, hooks);
    } while (retriggerUploads.has(id));
  };

  const promise = run()
    .catch((err) => {
      console.error(`[r2] upload failed for event ${id}:`, err?.message || err);
    })
    .finally(() => {
      inflightUploads.delete(id);
    });
  inflightUploads.set(id, promise);
  return promise;
}

function collectMp4Files(root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;

  const walk = (dir, rel = '') => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs, childRel);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.mp4')) continue;
      out.push({ abs, rel: childRel });
    }
  };
  walk(root);
  return out;
}

async function loadEventForFile(rel, abs, { loadEventById, findEventByLocalPath }) {
  const top = String(rel || '').replace(/\\/g, '/').split('/')[0] || '';
  if (/^[a-fA-F0-9]{24}$/.test(top)) {
    const event = loadEventById ? await loadEventById(top) : await Event.findById(top);
    if (event) return event;
  }
  if (findEventByLocalPath) return findEventByLocalPath(abs);
  return Event.findOne({
    $or: [{ recordingPath: abs }, { 'recordings.localPath': abs }],
  });
}

/**
 * Disk pass: delete a local MP4 only when Mongo maps it to storage=r2 and HEAD+size match.
 */
export async function sweepVerifiedLocalRecordings({
  root = RECORDINGS_ROOT,
  now = Date.now(),
  headFn = headR2Object,
  unlinkFn = unlinkLocalFile,
  existsFn = fs.existsSync,
  statFn = defaultLocalStat,
  loadEventById,
  findEventByLocalPath,
  listFilesFn = collectMp4Files,
} = {}) {
  if (!existsFn(root)) {
    console.log('[r2] cleanup skipped recordings root missing');
    return { scanned: 0, removed: 0, skipped: 0 };
  }

  const files = listFilesFn(root);
  let removed = 0;
  let skipped = 0;

  for (const file of files) {
    if (isUnsafeRecordingRelPath(file.rel)) {
      console.log(`[r2] cleanup skipped temp/work file: ${file.abs}`);
      skipped += 1;
      continue;
    }
    const st = statFn(file.abs);
    if (!st) {
      skipped += 1;
      continue;
    }
    if (isRecentRecordingFile(st.mtimeMs, now)) {
      console.log(`[r2] cleanup skipped too recent: ${file.abs}`);
      skipped += 1;
      continue;
    }

    let event = null;
    try {
      event = await loadEventForFile(file.rel, file.abs, { loadEventById, findEventByLocalPath });
    } catch (err) {
      console.log(`[r2] cleanup skipped lookup failed ${file.abs}: ${err.message}`);
      skipped += 1;
      continue;
    }
    if (!event) {
      console.log(`[r2] cleanup skipped unmapped: ${file.abs}`);
      skipped += 1;
      continue;
    }

    const part = matchPartForLocalFile(event, file.abs);
    if (!part) {
      console.log(`[r2] cleanup skipped unmapped: ${file.abs}`);
      skipped += 1;
      continue;
    }
    if (part.storage !== 'r2' || !part.r2Key) {
      console.log(`[r2] cleanup skipped storage-local: ${file.abs}`);
      skipped += 1;
      continue;
    }

    const result = await safeUnlinkLocalAfterR2(
      {
        localPath: file.abs,
        r2Key: part.r2Key,
        expectedLocalSize: st.size,
        storage: part.storage,
      },
      { headFn, unlinkFn, existsFn, statFn }
    );
    if (result.ok && result.reason === 'removed') removed += 1;
    else skipped += 1;
  }

  return { scanned: files.length, removed, skipped };
}

async function listEventsNeedingUpload() {
  return Event.find({
    $or: [
      { 'recordings.storage': 'local' },
      { recordingStorage: 'local', recordingPath: { $nin: [null, ''] } },
      { recordingPath: { $nin: [null, ''] } },
    ],
  }).select('_id');
}

/** One hourly cycle: retry pending uploads, then delete only HEAD-verified leftovers. */
export async function runRecordingR2SyncCycle(hooks = {}) {
  if (!isR2Configured() && !hooks.uploadFn) {
    console.log('[r2] cleanup skipped R2 not configured');
    return { uploaded: 0, sweep: { scanned: 0, removed: 0, skipped: 0 } };
  }
  if (!fs.existsSync(RECORDINGS_ROOT) && !hooks.listFilesFn) {
    console.log('[r2] cleanup skipped recordings root missing');
    return { uploaded: 0, sweep: { scanned: 0, removed: 0, skipped: 0 } };
  }

  let uploaded = 0;
  const events = hooks.listPendingEvents
    ? await hooks.listPendingEvents()
    : await listEventsNeedingUpload();
  for (const row of events || []) {
    const id = String(row.id || row._id || '');
    if (!id) continue;
    const result = await uploadAllPendingLocalParts(id, hooks);
    uploaded += Number(result.uploaded || 0);
  }

  const sweep = await sweepVerifiedLocalRecordings(hooks);
  return { uploaded, sweep };
}
