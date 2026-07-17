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
 * Public vs admin visibility for an event recording.
 * After 30 days the recording is hidden from visitors but kept in storage.
 */
export function getRecordingState(event, { now = new Date() } = {}) {
  const deleted = Boolean(event.recordingDeletedAt);
  const pathOnDisk = event.recordingPath || '';
  const inR2 = Boolean(event.recordingStorage === 'r2' && event.recordingR2Key);
  const exists = !deleted && (inR2 || recordingFileExists(pathOnDisk));
  const recordedAt = event.recordingRecordedAt
    ? new Date(event.recordingRecordedAt)
    : null;
  const publicUntil = event.recordingPublicUntil
    ? new Date(event.recordingPublicUntil)
    : recordedAt
      ? addDays(recordedAt, RECORDING_PUBLIC_DAYS)
      : null;
  const expired = Boolean(publicUntil && now > publicUntil);
  const adminHidden = Boolean(event.recordingHidden);
  const publiclyVisible = Boolean(exists && !adminHidden && !expired);

  return {
    hasRecording: exists,
    recordingStorage: inR2 ? 'r2' : 'local',
    recordingR2Key: inR2 ? event.recordingR2Key : '',
    recordingR2Url: inR2 ? event.recordingR2Url || '' : '',
    recordingPath: exists ? pathOnDisk : '',
    recordingFilename: exists
      ? event.recordingFilename || path.basename(pathOnDisk || event.recordingR2Key || '')
      : '',
    recordingRecordedAt: recordedAt,
    recordingPublicUntil: publicUntil,
    recordingDurationSec: event.recordingDurationSec || 0,
    recordingHidden: adminHidden,
    recordingExpired: expired,
    recordingDeleted: deleted,
    publiclyVisible,
    // Relative API path used by browsers (absolute URL built by callers).
    playPath: exists ? `/api/events/${event.id || event._id}/stream/recording` : '',
    downloadPath: exists
      ? `/api/events/${event.id || event._id}/stream/recording/download`
      : '',
  };
}

export function buildPublicRecordingUrl(event, { apiOrigin = '' } = {}) {
  const state = getRecordingState(event);
  if (!state.publiclyVisible || !state.playPath) return '';
  const origin = String(apiOrigin || '').replace(/\/+$/, '');
  return origin ? `${origin}${state.playPath}` : state.playPath;
}

export function buildAdminRecordingUrl(event, { apiOrigin = '' } = {}) {
  const state = getRecordingState(event);
  if (!state.hasRecording || !state.playPath) return '';
  const origin = String(apiOrigin || '').replace(/\/+$/, '');
  return origin ? `${origin}${state.playPath}` : state.playPath;
}

/** Persist a newly finalized recording onto the event document. */
export function applyRecordingToEvent(event, { filePath, durationSec = 0, recordedAt = new Date() }) {
  const abs = resolveRecordingAbsolutePath(filePath);
  if (!abs) throw new Error('Invalid recording path');
  if (!fs.existsSync(abs)) throw new Error('Recording file not found');

  const when = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
  event.recordingPath = abs;
  event.recordingFilename = path.basename(abs);
  event.recordingUrl = `/api/events/${event.id || event._id}/stream/recording`;
  event.recordingRecordedAt = when;
  event.recordingPublicUntil = addDays(when, RECORDING_PUBLIC_DAYS);
  event.recordingDurationSec = Math.max(0, Number(durationSec) || 0);
  event.recordingHidden = false;
  event.recordingDeletedAt = undefined;
  // Fresh local file supersedes any earlier R2 object; upload runs again after.
  event.recordingStorage = 'local';
  event.recordingR2Key = '';
  event.recordingR2Url = '';
  return event;
}
