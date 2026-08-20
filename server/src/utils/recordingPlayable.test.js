import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreSoftDeletedPlayableParts } from './recordingPlayable.js';

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
