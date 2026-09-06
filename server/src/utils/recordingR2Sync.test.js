import assert from 'node:assert/strict';
import path from 'path';
import test from 'node:test';
import { RECORDINGS_ROOT } from './recording.js';
import {
  extractEventIdsFromRecordingRelPath,
  isRecentRecordingFile,
  isUnsafeRecordingRelPath,
  listPendingLocalParts,
  loadEventForFile,
  matchPartForLocalFile,
  RECORDING_R2_MIN_AGE_MS,
  safeUnlinkLocalAfterR2,
  shouldUnlinkLocalAfterR2,
  sweepVerifiedLocalRecordings,
  unlinkOriginalsReplacedByMergedR2,
  uploadAllPendingLocalParts,
} from './recordingR2Sync.js';

const EVENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function recPath(name) {
  return path.resolve(RECORDINGS_ROOT, EVENT_ID, name);
}

function makeEvent(parts) {
  return {
    _id: EVENT_ID,
    id: EVENT_ID,
    recordings: parts,
    recordingPath: parts[parts.length - 1]?.localPath || '',
    recordingStorage: 'local',
    recordingR2Key: '',
    async save() {
      return this;
    },
  };
}

test('shouldUnlinkLocalAfterR2 requires r2 + HEAD + matching size', () => {
  assert.equal(shouldUnlinkLocalAfterR2({ storage: 'local', r2Key: 'k', head: { exists: true, size: 10 }, localSize: 10 }).ok, false);
  assert.equal(shouldUnlinkLocalAfterR2({ storage: 'r2', r2Key: '', head: { exists: true, size: 10 }, localSize: 10 }).ok, false);
  assert.equal(shouldUnlinkLocalAfterR2({ storage: 'r2', r2Key: 'k', head: { exists: false, size: 0 }, localSize: 10 }).ok, false);
  assert.equal(shouldUnlinkLocalAfterR2({ storage: 'r2', r2Key: 'k', head: { exists: true, size: 0 }, localSize: 10 }).ok, false);
  assert.equal(shouldUnlinkLocalAfterR2({ storage: 'r2', r2Key: 'k', head: { exists: true, size: 9 }, localSize: 10 }).ok, false);
  assert.equal(shouldUnlinkLocalAfterR2({ mapped: false, storage: 'r2', r2Key: 'k', head: { exists: true, size: 10 }, localSize: 10 }).ok, false);
  assert.equal(shouldUnlinkLocalAfterR2({ storage: 'r2', r2Key: 'k', head: { exists: true, size: 10 }, localSize: 10 }).ok, true);
  assert.equal(
    shouldUnlinkLocalAfterR2({
      storage: 'r2',
      r2Key: 'k',
      head: { exists: true, size: 10 },
      localSize: 10,
      mergedValidated: false,
    }).ok,
    false
  );
});

test('isUnsafeRecordingRelPath skips temp and merge-work files', () => {
  assert.equal(isUnsafeRecordingRelPath(`${EVENT_ID}/.2026.mp4.tmp.mp4`), true);
  assert.equal(isUnsafeRecordingRelPath(`${EVENT_ID}/.merge-work/a.mp4`), true);
  assert.equal(isUnsafeRecordingRelPath(`${EVENT_ID}/2026-07-19_12-00-00.mp4`), false);
});

test('listPendingLocalParts returns ALL local parts, not only newest', () => {
  const a = recPath('old.mp4');
  const b = recPath('new.mp4');
  const event = makeEvent([
    { filename: 'old.mp4', localPath: a, storage: 'local', r2Key: '', startedAt: new Date('2026-07-19T10:00:00Z') },
    { filename: 'new.mp4', localPath: b, storage: 'local', r2Key: '', startedAt: new Date('2026-07-19T11:00:00Z') },
  ]);
  const pending = listPendingLocalParts(event, { existsFn: (p) => p === a || p === b });
  assert.equal(pending.length, 2);
  assert.deepEqual(pending.map((x) => path.basename(x.abs)).sort(), ['new.mp4', 'old.mp4']);
});

test('listPendingLocalParts skips parts already on R2', () => {
  const a = recPath('old.mp4');
  const event = makeEvent([
    {
      filename: 'old.mp4',
      localPath: a,
      storage: 'r2',
      r2Key: `recordings/${EVENT_ID}/old.mp4`,
      startedAt: new Date('2026-07-19T10:00:00Z'),
    },
  ]);
  const pending = listPendingLocalParts(event, { existsFn: () => true, listFilesFn: () => [] });
  assert.equal(pending.length, 0);
});

test('safeUnlinkLocalAfterR2 deletes only after HEAD size match', async () => {
  const abs = recPath('clip.mp4');
  const removed = [];
  const ok = await safeUnlinkLocalAfterR2(
    { localPath: abs, r2Key: `recordings/${EVENT_ID}/clip.mp4`, expectedLocalSize: 50, storage: 'r2' },
    {
      headFn: async () => ({ exists: true, size: 50 }),
      existsFn: () => true,
      statFn: () => ({ size: 50, mtimeMs: Date.now() - 300_000 }),
      unlinkFn: (p) => removed.push(p),
    }
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, 'removed');
  assert.deepEqual(removed, [abs]);
});

test('safeUnlinkLocalAfterR2 never deletes storage=local', async () => {
  const abs = recPath('clip.mp4');
  const removed = [];
  const res = await safeUnlinkLocalAfterR2(
    { localPath: abs, r2Key: `recordings/${EVENT_ID}/clip.mp4`, expectedLocalSize: 50, storage: 'local' },
    {
      headFn: async () => ({ exists: true, size: 50 }),
      existsFn: () => true,
      statFn: () => ({ size: 50, mtimeMs: 1 }),
      unlinkFn: (p) => removed.push(p),
    }
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'storage-local');
  assert.equal(removed.length, 0);
});

test('safeUnlinkLocalAfterR2 skips size mismatch', async () => {
  const abs = recPath('clip.mp4');
  const removed = [];
  const res = await safeUnlinkLocalAfterR2(
    { localPath: abs, r2Key: `recordings/${EVENT_ID}/clip.mp4`, expectedLocalSize: 50, storage: 'r2' },
    {
      headFn: async () => ({ exists: true, size: 49 }),
      existsFn: () => true,
      statFn: () => ({ size: 50, mtimeMs: 1 }),
      unlinkFn: (p) => removed.push(p),
    }
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'size-mismatch');
  assert.equal(removed.length, 0);
});

test('uploadAllPendingLocalParts uploads every local part and retries once', async () => {
  const a = recPath('old.mp4');
  const b = recPath('new.mp4');
  const event = makeEvent([
    { filename: 'old.mp4', localPath: a, storage: 'local', r2Key: '', startedAt: new Date('2026-07-19T10:00:00Z') },
    { filename: 'new.mp4', localPath: b, storage: 'local', r2Key: '', startedAt: new Date('2026-07-19T11:00:00Z') },
  ]);
  const uploads = [];
  let fails = 1;
  const removed = [];
  const result = await uploadAllPendingLocalParts(EVENT_ID, {
    loadEvent: async () => event,
    existsFn: (p) => p === a || p === b,
    statFn: () => ({ size: 20, mtimeMs: Date.now() - 300_000 }),
    sleepFn: async () => {},
    retries: 3,
    uploadFn: async (local, key) => {
      uploads.push(key);
      if (fails > 0) {
        fails -= 1;
        throw new Error('transient');
      }
      return { url: `https://r2/${key}`, size: 20 };
    },
    headFn: async () => ({ exists: true, size: 20 }),
    unlinkFn: (p) => removed.push(p),
  });
  assert.equal(result.uploaded, 2);
  assert.equal(uploads.length, 3); // first old failed + retry + new
  assert.equal(event.recordings[0].storage, 'r2');
  assert.equal(event.recordings[1].storage, 'r2');
  assert.equal(event.recordings[0].r2Key, `recordings/${EVENT_ID}/old.mp4`);
  assert.equal(removed.length, 2);
});

test('sweepVerifiedLocalRecordings never deletes unmapped or local-only files', async () => {
  const mapped = recPath('kept-on-r2.mp4');
  const localOnly = recPath('still-local.mp4');
  const unmapped = path.join(RECORDINGS_ROOT, 'live', 'orphan.mp4');
  const removed = [];
  const event = makeEvent([
    {
      filename: 'kept-on-r2.mp4',
      localPath: mapped,
      storage: 'r2',
      r2Key: `recordings/${EVENT_ID}/kept-on-r2.mp4`,
      startedAt: new Date('2026-07-19T10:00:00Z'),
    },
    {
      filename: 'still-local.mp4',
      localPath: localOnly,
      storage: 'local',
      r2Key: '',
      startedAt: new Date('2026-07-19T11:00:00Z'),
    },
  ]);

  const sweep = await sweepVerifiedLocalRecordings({
    root: RECORDINGS_ROOT,
    now: Date.now(),
    existsFn: () => true,
    statFn: () => ({ size: 33, mtimeMs: Date.now() - 300_000 }),
    headFn: async () => ({ exists: true, size: 33 }),
    unlinkFn: (p) => removed.push(p),
    loadEventById: async (id) => (id === EVENT_ID ? event : null),
    findEventByLocalPath: async () => null,
    listFilesFn: () => [
      { abs: mapped, rel: `${EVENT_ID}/kept-on-r2.mp4` },
      { abs: localOnly, rel: `${EVENT_ID}/still-local.mp4` },
      { abs: unmapped, rel: 'live/orphan.mp4' },
    ],
  });

  assert.equal(sweep.removed, 1);
  assert.deepEqual(removed, [mapped]);
  assert.ok(sweep.skipped >= 2);
});

test('unlinkOriginalsReplacedByMergedR2 waits for verified merged object', async () => {
  const a = recPath('part1.mp4');
  const removed = [];
  const fail = await unlinkOriginalsReplacedByMergedR2([a], { mergedR2Key: 'k', mergedSize: 99 }, {
    headFn: async () => ({ exists: true, size: 1 }),
    existsFn: () => true,
    unlinkFn: (p) => removed.push(p),
  });
  assert.equal(fail.ok, false);
  assert.equal(removed.length, 0);

  const ok = await unlinkOriginalsReplacedByMergedR2([a], { mergedR2Key: 'k', mergedSize: 99 }, {
    headFn: async () => ({ exists: true, size: 99 }),
    existsFn: () => true,
    unlinkFn: (p) => removed.push(p),
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(removed, [a]);
});

test('matchPartForLocalFile maps leftover local file to r2 key by filename', () => {
  const abs = recPath('solo.mp4');
  const event = {
    id: EVENT_ID,
    recordingStorage: 'r2',
    recordingR2Key: `recordings/${EVENT_ID}/solo.mp4`,
    recordingFilename: 'solo.mp4',
    recordings: [
      {
        filename: 'solo.mp4',
        storage: 'r2',
        r2Key: `recordings/${EVENT_ID}/solo.mp4`,
        localPath: '',
        startedAt: new Date('2026-07-18T12:00:00Z'),
      },
    ],
  };
  const part = matchPartForLocalFile(event, abs);
  assert.ok(part);
  assert.equal(part.storage, 'r2');
  assert.equal(part.r2Key, `recordings/${EVENT_ID}/solo.mp4`);
});

const UNKNOWN_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function livePath(name) {
  return path.resolve(RECORDINGS_ROOT, 'live', EVENT_ID, name);
}

test('extractEventIdsFromRecordingRelPath reads first segment and live/<eventId>/', () => {
  assert.deepEqual(extractEventIdsFromRecordingRelPath(`${EVENT_ID}/file.mp4`), [EVENT_ID]);
  assert.deepEqual(extractEventIdsFromRecordingRelPath(`live/${EVENT_ID}/file.mp4`), [EVENT_ID]);
  assert.deepEqual(extractEventIdsFromRecordingRelPath('live/orphan/file.mp4'), []);
  assert.deepEqual(extractEventIdsFromRecordingRelPath(`live/${UNKNOWN_ID}/file.mp4`), [UNKNOWN_ID]);
});

test('loadEventForFile maps recordings/<eventId>/file.mp4', async () => {
  const event = makeEvent([]);
  const abs = recPath('file.mp4');
  const found = await loadEventForFile(`${EVENT_ID}/file.mp4`, abs, {
    loadEventById: async (id) => (id === EVENT_ID ? event : null),
    findEventByLocalPath: async () => null,
  });
  assert.equal(found, event);
});

test('loadEventForFile maps recordings/live/<eventId>/file.mp4', async () => {
  const event = makeEvent([]);
  const abs = livePath('file.mp4');
  const found = await loadEventForFile(`live/${EVENT_ID}/file.mp4`, abs, {
    loadEventById: async (id) => (id === EVENT_ID ? event : null),
    findEventByLocalPath: async () => null,
  });
  assert.equal(found, event);
});

test('loadEventForFile leaves live/orphan unmapped', async () => {
  const abs = path.resolve(RECORDINGS_ROOT, 'live', 'orphan', 'file.mp4');
  const found = await loadEventForFile('live/orphan/file.mp4', abs, {
    loadEventById: async () => {
      throw new Error('should not look up a non-hex folder as an event id');
    },
    findEventByLocalPath: async () => null,
  });
  assert.equal(found, null);
});

test('loadEventForFile leaves unknown 24-hex path unmapped when Mongo has no event', async () => {
  const abs = path.resolve(RECORDINGS_ROOT, 'live', UNKNOWN_ID, 'file.mp4');
  const found = await loadEventForFile(`live/${UNKNOWN_ID}/file.mp4`, abs, {
    loadEventById: async () => null,
    findEventByLocalPath: async () => null,
  });
  assert.equal(found, null);
});

test('listPendingLocalParts finds an unmapped file under live/<eventId>/', () => {
  const abs = livePath('clip.mp4');
  const event = makeEvent([]);
  event.recordingPath = '';
  const pending = listPendingLocalParts(event, {
    existsFn: (p) => p === abs,
    listFilesFn: () => [{ abs, rel: `live/${EVENT_ID}/clip.mp4` }],
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].abs, abs);
});

test('upload from live/<eventId>/ keeps R2 key recordings/<eventId>/<filename>', async () => {
  const abs = livePath('clip.mp4');
  const event = makeEvent([]);
  event.recordingPath = '';
  const uploads = [];
  const result = await uploadAllPendingLocalParts(EVENT_ID, {
    loadEvent: async () => event,
    existsFn: (p) => p === abs,
    listFilesFn: () => [{ abs, rel: `live/${EVENT_ID}/clip.mp4` }],
    statFn: () => ({ size: 20, mtimeMs: Date.now() - 300_000 }),
    sleepFn: async () => {},
    retries: 1,
    uploadFn: async (local, key) => {
      uploads.push(key);
      return { url: `https://r2/${key}`, size: 20 };
    },
    headFn: async () => ({ exists: true, size: 20 }),
    unlinkFn: () => {},
  });
  assert.equal(result.uploaded, 1);
  assert.deepEqual(uploads, [`recordings/${EVENT_ID}/clip.mp4`]);
  assert.equal(event.recordings[0].r2Key, `recordings/${EVENT_ID}/clip.mp4`);
});

test('too-recent files are deferred and not uploaded', async () => {
  assert.equal(isRecentRecordingFile(Date.now(), Date.now(), RECORDING_R2_MIN_AGE_MS), true);
  assert.equal(isRecentRecordingFile(Date.now() - RECORDING_R2_MIN_AGE_MS - 1, Date.now(), RECORDING_R2_MIN_AGE_MS), false);

  const abs = recPath('fresh.mp4');
  const event = makeEvent([
    { filename: 'fresh.mp4', localPath: abs, storage: 'local', r2Key: '', startedAt: new Date() },
  ]);
  const uploads = [];
  const removed = [];
  const result = await uploadAllPendingLocalParts(EVENT_ID, {
    loadEvent: async () => event,
    existsFn: (p) => p === abs,
    listFilesFn: () => [],
    statFn: () => ({ size: 20, mtimeMs: Date.now() }),
    sleepFn: async () => {},
    retries: 1,
    uploadFn: async (_local, key) => {
      uploads.push(key);
      return { url: `https://r2/${key}`, size: 20 };
    },
    headFn: async () => ({ exists: true, size: 20 }),
    unlinkFn: (p) => removed.push(p),
  });
  assert.equal(result.uploaded, 0);
  assert.equal(uploads.length, 0);
  assert.equal(removed.length, 0);
  assert.equal(event.recordings[0].storage, 'local');
});

test('sweep maps live/<eventId>/ but still will not delete storage=local', async () => {
  const mappedLive = livePath('kept-local.mp4');
  const removed = [];
  const event = makeEvent([
    {
      filename: 'kept-local.mp4',
      localPath: mappedLive,
      storage: 'local',
      r2Key: '',
      startedAt: new Date('2026-07-19T10:00:00Z'),
    },
  ]);
  const sweep = await sweepVerifiedLocalRecordings({
    root: RECORDINGS_ROOT,
    now: Date.now(),
    existsFn: () => true,
    statFn: () => ({ size: 33, mtimeMs: Date.now() - 300_000 }),
    headFn: async () => ({ exists: true, size: 33 }),
    unlinkFn: (p) => removed.push(p),
    loadEventById: async (id) => (id === EVENT_ID ? event : null),
    findEventByLocalPath: async () => null,
    listFilesFn: () => [{ abs: mappedLive, rel: `live/${EVENT_ID}/kept-local.mp4` }],
  });
  assert.equal(sweep.removed, 0);
  assert.equal(removed.length, 0);
  assert.ok(sweep.skipped >= 1);
});

test('sweep leaves live/orphan and unknown 24-hex folders unmapped', async () => {
  const orphan = path.join(RECORDINGS_ROOT, 'live', 'orphan', 'file.mp4');
  const unknown = path.join(RECORDINGS_ROOT, 'live', UNKNOWN_ID, 'file.mp4');
  const removed = [];
  const sweep = await sweepVerifiedLocalRecordings({
    root: RECORDINGS_ROOT,
    now: Date.now(),
    existsFn: () => true,
    statFn: () => ({ size: 33, mtimeMs: Date.now() - 300_000 }),
    headFn: async () => ({ exists: true, size: 33 }),
    unlinkFn: (p) => removed.push(p),
    loadEventById: async () => null,
    findEventByLocalPath: async () => null,
    listFilesFn: () => [
      { abs: orphan, rel: 'live/orphan/file.mp4' },
      { abs: unknown, rel: `live/${UNKNOWN_ID}/file.mp4` },
    ],
  });
  assert.equal(sweep.removed, 0);
  assert.equal(removed.length, 0);
  assert.equal(sweep.skipped, 2);
});
