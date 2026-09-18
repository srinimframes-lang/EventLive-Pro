import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { RECORDINGS_ROOT } from './recording.js';
import {
  persistPlayableRecordingParts,
  restoreSoftDeletedPlayableParts,
  partSourceExists,
} from './recordingPlayable.js';

test('restoreSoftDeletedPlayableParts clears deletedAt on leftover originals only', () => {
  const orig = {
    _id: 'o1',
    filename: '2026-08-16_18-26-15-800755.mp4',
    localPath: '/root/EventLive-Pro/recordings/e/a.mp4',
    deletedAt: new Date('2026-08-16T18:31:33.400Z'),
  };
  const merged = {
    _id: 'm1',
    filename: 'merged_1786916022256.mp4',
    deletedAt: undefined,
  };
  const other = {
    _id: 'x1',
    filename: 'other.mp4',
    deletedAt: new Date('2026-08-16T18:31:33.400Z'),
  };
  const event = { recordings: [orig, other, merged] };
  const changed = restoreSoftDeletedPlayableParts(event, [orig]);
  assert.equal(changed, true);
  assert.equal(orig.deletedAt, null);
  assert.ok(other.deletedAt instanceof Date);
  assert.equal(merged.deletedAt, undefined);
});

test('playback fallback does not persist deletedAt=null on inspected originals', async () => {
  const orig = {
    _id: 'o1',
    filename: '2026-09-06_09-00-00-000000.mp4',
    localPath: path.join(RECORDINGS_ROOT, 'aaaaaaaaaaaaaaaaaaaaaaaa', '2026-09-06_09-00-00-000000.mp4'),
    storage: 'local',
    sizeBytes: 5_000_000,
    deletedAt: new Date('2026-09-06T10:05:00Z'),
  };
  const merged = {
    _id: 'm1',
    filename: 'merged_1757152800000.mp4',
    localPath: path.join(RECORDINGS_ROOT, 'aaaaaaaaaaaaaaaaaaaaaaaa', 'merged_1757152800000.mp4'),
    storage: 'local',
    sizeBytes: 9_000_000,
  };
  let saved = 0;
  const event = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    recordings: [orig, merged],
    async save() {
      saved += 1;
      return this;
    },
    markModified() {},
  };

  const playable = await persistPlayableRecordingParts(event);
  assert.ok(Array.isArray(playable));
  assert.equal(saved, 0);
  assert.ok(orig.deletedAt instanceof Date);
  assert.equal(event.recordings.filter((p) => !p.deletedAt).length, 1);
  assert.equal(event.recordings.filter((p) => !p.deletedAt)[0].filename, 'merged_1757152800000.mp4');
});

test('restoreSoftDeletedPlayableParts never touches merged files or empty lists', () => {
  const merged = {
    _id: 'm1',
    filename: 'merged_1.mp4',
    deletedAt: new Date(),
  };
  const event = { recordings: [merged] };
  assert.equal(restoreSoftDeletedPlayableParts(event, [merged]), false);
  assert.ok(merged.deletedAt instanceof Date);
  assert.equal(restoreSoftDeletedPlayableParts({ recordings: [] }, []), false);
});

test('stale localPath + sizeBytes is not proof the file exists', async () => {
  const missing = path.join(RECORDINGS_ROOT, '6a81adf1ce2dbab2249f08cd', '2026-08-16_18-26-15-800755.mp4');
  const exists = await partSourceExists(
    {
      filename: '2026-08-16_18-26-15-800755.mp4',
      localPath: missing,
      storage: 'local',
      r2Key: '',
      sizeBytes: 59656804,
    },
    '6a81adf1ce2dbab2249f08cd'
  );
  assert.equal(exists, false);
});

test('old local recording exists under live/<eventId>/ -> playable', async () => {
  const id = '6a81adf1ce2dbab2249f08cd';
  const name = '2026-08-16_18-26-15-800755.mp4';
  const live = path.join(RECORDINGS_ROOT, 'live', id, name);
  const exists = await partSourceExists(
    {
      filename: name,
      localPath: path.join(RECORDINGS_ROOT, id, name),
      storage: 'local',
      r2Key: '',
      sizeBytes: 59656804,
    },
    id,
    {
      existsFn: (p) => p === path.resolve(live),
      statFn: () => ({ isFile: () => true, size: 59656804 }),
    }
  );
  assert.equal(exists, true);
});

test('local recording under recordings/<eventId>/ -> playable', async () => {
  const id = '6a81adf1ce2dbab2249f08cd';
  const name = '2026-08-19_04-00-00.mp4';
  const current = path.join(RECORDINGS_ROOT, id, name);
  const exists = await partSourceExists(
    {
      filename: name,
      localPath: current,
      storage: 'local',
      r2Key: '',
    },
    id,
    {
      existsFn: (p) => p === path.resolve(current),
      statFn: () => ({ isFile: () => true, size: 12_000_000 }),
    }
  );
  assert.equal(exists, true);
});
