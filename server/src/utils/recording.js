import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute root for MediaMTX finalized recordings. */
export const RECORDINGS_ROOT = path.resolve(
  process.env.RECORDINGS_ROOT || path.join(__dirname, '../../../recordings')
);

export const RECORDING_PUBLIC_DAYS = 30;

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Safe absolute path under RECORDINGS_ROOT, or null if invalid. */
export function resolveRecordingAbsolutePath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return null;

  let abs;
  if (path.isAbsolute(raw)) {
    abs = path.resolve(raw);
  } else {
    // Allow repo-relative paths like recordings/<eventId>/file.mp4
    abs = path.resolve(RECORDINGS_ROOT, raw.replace(/^recordings[/\\]/, ''));
  }

  const root = path.resolve(RECORDINGS_ROOT) + path.sep;
  if (abs !== path.resolve(RECORDINGS_ROOT) && !abs.startsWith(root)) return null;
  if (!abs.toLowerCase().endsWith('.mp4')) return null;
  return abs;
}

export function recordingFileExists(filePath) {
  const abs = resolveRecordingAbsolutePath(filePath);
  if (!abs) return false;
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Parse MediaMTX segment filename timestamps:
 * `2026-07-19_12-04-17-209175.mp4` → Date (UTC components matching VPS naming).
 */
export function parseRecordingFilenameTimestamp(filename) {
  const m = String(filename || '').match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?/
  );
  if (!m) return null;
  const d = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      m[7] ? Math.min(999, Math.floor(Number(m[7]) / 1000)) : 0
    )
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function eventIdOf(event) {
  return String(event.id || event._id || '');
}

/** Ensure recordings[] exists as a mutable array on the document/plain object. */
export function ensureRecordingsArray(event) {
  if (!Array.isArray(event.recordings)) event.recordings = [];
  return event.recordings;
}

/**
 * Back-compat: if history is empty but legacy single-pointer fields exist,
 * synthesize one in-memory part (does not persist unless caller saves).
 */
export function hydrateLegacyRecordingPart(event) {
  const parts = ensureRecordingsArray(event);
  if (parts.length > 0) return parts;

  const hasR2 = Boolean(event.recordingStorage === 'r2' && event.recordingR2Key);
  const hasLocal = Boolean(event.recordingPath && recordingFileExists(event.recordingPath));
  if (!hasR2 && !hasLocal) return parts;

  const filename =
    event.recordingFilename ||
    path.basename(event.recordingR2Key || event.recordingPath || '') ||
    '';
  const startedAt =
    parseRecordingFilenameTimestamp(filename) ||
    (event.recordingRecordedAt ? new Date(event.recordingRecordedAt) : new Date());

  parts.push({
    r2Key: hasR2 ? event.recordingR2Key : '',
    r2Url: hasR2 ? event.recordingR2Url || '' : '',
    filename,
    localPath: hasLocal ? event.recordingPath : '',
    storage: hasR2 ? 'r2' : 'local',
    startedAt,
    endedAt: event.recordingRecordedAt || startedAt,
    durationSec: Math.max(0, Number(event.recordingDurationSec) || 0),
    sizeBytes: 0,
    createdAt: event.recordingRecordedAt || startedAt,
    deletedAt: event.recordingDeletedAt || undefined,
  });
  return parts;
}

/** Active (non-deleted) parts, oldest → newest. */
export function listActiveRecordingParts(event) {
  hydrateLegacyRecordingPart(event);
  const parts = ensureRecordingsArray(event)
    .filter((p) => p && !p.deletedAt)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.startedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.startedAt || b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.filename || '').localeCompare(String(b.filename || ''));
    });
  return parts;
}

export function findRecordingPart(event, partId) {
  if (!partId) return null;
  const id = String(partId);
  return (
    ensureRecordingsArray(event).find((p) => p && String(p._id || p.id) === id && !p.deletedAt) ||
    null
  );
}

/** Sync top-level legacy fields from the newest active part (or clear). */
export function syncLegacyRecordingFields(event) {
  const parts = listActiveRecordingParts(event);
  const latest = parts.length ? parts[parts.length - 1] : null;
  if (!latest) {
    event.recordingPath = '';
    event.recordingFilename = '';
    event.recordingUrl = '';
    event.recordingStorage = 'local';
    event.recordingR2Key = '';
    event.recordingR2Url = '';
    event.recordingDurationSec = 0;
    event.recordingRecordedAt = undefined;
    event.recordingPublicUntil = undefined;
    return event;
  }

  event.recordingPath = latest.localPath || event.recordingPath || '';
  event.recordingFilename = latest.filename || '';
  event.recordingUrl = `/api/events/${eventIdOf(event)}/stream/recording`;
  event.recordingStorage = latest.storage === 'r2' ? 'r2' : 'local';
  event.recordingR2Key = latest.storage === 'r2' ? latest.r2Key || '' : '';
  event.recordingR2Url = latest.storage === 'r2' ? latest.r2Url || '' : '';
  event.recordingDurationSec = Math.max(0, Number(latest.durationSec) || 0);
  event.recordingRecordedAt = latest.endedAt || latest.createdAt || latest.startedAt;
  if (!event.recordingPublicUntil && event.recordingRecordedAt) {
    event.recordingPublicUntil = addDays(event.recordingRecordedAt, RECORDING_PUBLIC_DAYS);
  }
  event.recordingDeletedAt = undefined;
  return event;
}

function partPlayPath(event, part) {
  const id = eventIdOf(event);
  const partId = part?._id || part?.id;
  if (partId) return `/api/events/${id}/stream/recording?part=${partId}`;
  return `/api/events/${id}/stream/recording`;
}

/**
 * Public vs admin visibility for an event recording.
 * After 30 days the recording is hidden from visitors but kept in storage.
 */
export function getRecordingState(event, { now = new Date() } = {}) {
  const deleted = Boolean(event.recordingDeletedAt);
  const parts = listActiveRecordingParts(event);
  const hasParts = parts.length > 0;
  const pathOnDisk = event.recordingPath || '';
  const inR2 = Boolean(event.recordingStorage === 'r2' && event.recordingR2Key);
  const exists = !deleted && (hasParts || inR2 || recordingFileExists(pathOnDisk));
  const recordedAt = event.recordingRecordedAt
    ? new Date(event.recordingRecordedAt)
    : parts[0]
      ? new Date(parts[0].startedAt || parts[0].createdAt)
      : null;
  const publicUntil = event.recordingPublicUntil
    ? new Date(event.recordingPublicUntil)
    : recordedAt
      ? addDays(recordedAt, RECORDING_PUBLIC_DAYS)
      : null;
  const expired = Boolean(publicUntil && now > publicUntil);
  const adminHidden = Boolean(event.recordingHidden);
  const publiclyVisible = Boolean(exists && !adminHidden && !expired);
  const first = parts[0] || null;
  const latest = parts.length ? parts[parts.length - 1] : null;

  return {
    hasRecording: exists,
    recordingCount: parts.length,
    recordingStorage: inR2 || latest?.storage === 'r2' ? 'r2' : 'local',
    recordingR2Key: inR2 ? event.recordingR2Key : latest?.r2Key || '',
    recordingR2Url: inR2 ? event.recordingR2Url || '' : latest?.r2Url || '',
    recordingPath: exists ? pathOnDisk || latest?.localPath || '' : '',
    recordingFilename: exists
      ? event.recordingFilename ||
        latest?.filename ||
        path.basename(pathOnDisk || event.recordingR2Key || '')
      : '',
    recordingRecordedAt: recordedAt,
    recordingPublicUntil: publicUntil,
    recordingDurationSec:
      parts.reduce((sum, p) => sum + (Number(p.durationSec) || 0), 0) ||
      event.recordingDurationSec ||
      0,
    recordingHidden: adminHidden,
    recordingExpired: expired,
    recordingDeleted: deleted,
    publiclyVisible,
    playPath: exists ? `/api/events/${eventIdOf(event)}/stream/recording` : '',
    downloadPath: exists
      ? `/api/events/${eventIdOf(event)}/stream/recording/download`
      : '',
    firstPlayPath: first ? partPlayPath(event, first) : '',
    parts: parts.map((p, index) => ({
      id: String(p._id || p.id || ''),
      part: index + 1,
      filename: p.filename || '',
      durationSec: Math.max(0, Number(p.durationSec) || 0),
      sizeBytes: Math.max(0, Number(p.sizeBytes) || 0),
      storage: p.storage === 'r2' ? 'r2' : 'local',
      r2Key: p.r2Key || '',
      startedAt: p.startedAt || null,
      endedAt: p.endedAt || null,
      createdAt: p.createdAt || null,
      playPath: partPlayPath(event, p),
      downloadPath: p._id || p.id
        ? `/api/events/${eventIdOf(event)}/stream/recording/download?part=${p._id || p.id}`
        : `/api/events/${eventIdOf(event)}/stream/recording/download`,
    })),
  };
}

export function buildPublicRecordingUrl(event, { apiOrigin = '' } = {}) {
  const state = getRecordingState(event);
  if (!state.publiclyVisible || !state.playPath) return '';
  // Prefer Part 1 (oldest) so replay starts chronologically.
  const path = state.firstPlayPath || state.playPath;
  const origin = String(apiOrigin || '').replace(/\/+$/, '');
  return origin ? `${origin}${path}` : path;
}

export function buildAdminRecordingUrl(event, { apiOrigin = '' } = {}) {
  const state = getRecordingState(event);
  if (!state.hasRecording || !state.playPath) return '';
  const path = state.firstPlayPath || state.playPath;
  const origin = String(apiOrigin || '').replace(/\/+$/, '');
  return origin ? `${origin}${path}` : path;
}

/**
 * Resolve which part to serve. `partId` optional — defaults to oldest active part
 * (Part 1), falling back to legacy single pointer.
 */
export function resolveRecordingPartForPlayback(event, partId) {
  const parts = listActiveRecordingParts(event);
  if (partId) {
    const found = findRecordingPart(event, partId);
    if (found) return found;
    return null;
  }
  if (parts.length) return parts[0];
  return null;
}

/** Persist a newly finalized recording as a new history entry (never replaces prior parts). */
export function applyRecordingToEvent(event, { filePath, durationSec = 0, recordedAt = new Date() }) {
  const abs = resolveRecordingAbsolutePath(filePath);
  if (!abs) throw new Error('Invalid recording path');
  if (!fs.existsSync(abs)) throw new Error('Recording file not found');

  const when = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
  const filename = path.basename(abs);
  const startedAt = parseRecordingFilenameTimestamp(filename) || when;
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(abs).size;
  } catch {
    sizeBytes = 0;
  }

  const parts = ensureRecordingsArray(event);
  // Deduplicate by filename/path if finalize is retried for the same segment.
  const existing = parts.find(
    (p) =>
      p &&
      !p.deletedAt &&
      (p.filename === filename || p.localPath === abs || (p.r2Key && p.r2Key.endsWith(`/${filename}`)))
  );
  if (existing) {
    existing.localPath = abs;
    existing.filename = filename;
    existing.durationSec = Math.max(0, Number(durationSec) || existing.durationSec || 0);
    existing.sizeBytes = sizeBytes || existing.sizeBytes || 0;
    existing.endedAt = when;
    if (existing.storage !== 'r2') existing.storage = 'local';
  } else {
    parts.push({
      r2Key: '',
      r2Url: '',
      filename,
      localPath: abs,
      storage: 'local',
      startedAt,
      endedAt: when,
      durationSec: Math.max(0, Number(durationSec) || 0),
      sizeBytes,
      createdAt: when,
    });
  }

  event.recordingHidden = false;
  event.recordingDeletedAt = undefined;
  if (!event.recordingPublicUntil) {
    event.recordingPublicUntil = addDays(when, RECORDING_PUBLIC_DAYS);
  } else {
    // Extend public window from the newest session.
    event.recordingPublicUntil = addDays(when, RECORDING_PUBLIC_DAYS);
  }

  syncLegacyRecordingFields(event);
  // Latest part is local until R2 upload finishes — clear only the legacy
  // pointer for THIS latest upload cycle (history entries keep prior R2 keys).
  event.recordingStorage = 'local';
  event.recordingR2Key = '';
  event.recordingR2Url = '';
  event.recordingPath = abs;
  event.recordingFilename = filename;
  return event;
}

/** Mark a local history part as uploaded to R2 (does not touch other parts). */
export function markRecordingPartUploaded(event, { filename, localPath, r2Key, r2Url, sizeBytes }) {
  const parts = ensureRecordingsArray(event);
  let part =
    parts.find(
      (p) =>
        p &&
        !p.deletedAt &&
        ((filename && p.filename === filename) ||
          (localPath && p.localPath === localPath) ||
          (r2Key && p.r2Key === r2Key))
    ) || null;

  if (!part) {
    const startedAt = parseRecordingFilenameTimestamp(filename) || new Date();
    part = {
      filename: filename || path.basename(r2Key || ''),
      localPath: '',
      storage: 'r2',
      r2Key,
      r2Url: r2Url || '',
      startedAt,
      endedAt: new Date(),
      durationSec: 0,
      sizeBytes: sizeBytes || 0,
      createdAt: new Date(),
    };
    parts.push(part);
  } else {
    part.storage = 'r2';
    part.r2Key = r2Key;
    part.r2Url = r2Url || '';
    part.localPath = '';
    if (sizeBytes) part.sizeBytes = sizeBytes;
  }

  syncLegacyRecordingFields(event);
  return part;
}

/**
 * Soft-remove one part from history and return storage cleanup hints.
 * Does not delete other parts or clear the whole event.
 */
export function removeRecordingPart(event, partId) {
  const parts = ensureRecordingsArray(event);
  const part = parts.find((p) => p && String(p._id || p.id) === String(partId) && !p.deletedAt);
  if (!part) return null;

  const cleanup = {
    r2Key: part.storage === 'r2' ? part.r2Key || '' : '',
    localPath: part.localPath || '',
  };
  part.deletedAt = new Date();
  // Prefer hard-removal from the array so admin UI stays clean.
  const idx = parts.indexOf(part);
  if (idx >= 0) parts.splice(idx, 1);

  const remaining = listActiveRecordingParts(event);
  if (!remaining.length) {
    event.recordingDeletedAt = new Date();
  }
  syncLegacyRecordingFields(event);
  return cleanup;
}

/** Clear all recording history + legacy fields (caller deletes R2/local objects). */
export function clearAllRecordingFields(event) {
  const parts = ensureRecordingsArray(event);
  const cleanup = parts
    .filter((p) => p && !p.deletedAt)
    .map((p) => ({
      r2Key: p.storage === 'r2' ? p.r2Key || '' : '',
      localPath: p.localPath || '',
    }));
  event.recordings = [];
  event.recordingPath = '';
  event.recordingFilename = '';
  event.recordingUrl = '';
  event.recordingStorage = 'local';
  event.recordingR2Key = '';
  event.recordingR2Url = '';
  event.recordingDurationSec = 0;
  event.recordingHidden = false;
  event.recordingDeletedAt = new Date();
  event.recordingRecordedAt = undefined;
  event.recordingPublicUntil = undefined;
  return cleanup;
}
