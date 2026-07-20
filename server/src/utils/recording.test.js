import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecordingState,
  listActiveRecordingParts,
  markRecordingPartUploaded,
  parseRecordingFilenameTimestamp,
  removeRecordingPart,
  syncLegacyRecordingFields,
} from './recording.js';

test('parseRecordingFilenameTimestamp reads MediaMTX names', () => {
  const d = parseRecordingFilenameTimestamp('2026-07-19_12-04-17-209175.mp4');
  assert.ok(d);
  assert.equal(d.toISOString().startsWith('2026-07-19T12:04:17'), true);
});

test('markRecordingPartUploaded keeps older parts when newest migrates', () => {
  const event = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    recordings: [
      {
        _id: '111111111111111111111111',
        filename: 'old.mp4',
        storage: 'r2',
        r2Key: 'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/old.mp4',
        r2Url: 'https://example/old.mp4',
        startedAt: new Date('2026-07-19T10:00:00Z'),
        endedAt: new Date('2026-07-19T10:30:00Z'),
        durationSec: 1800,
        createdAt: new Date('2026-07-19T10:30:00Z'),
      },
      {
        _id: '222222222222222222222222',
        filename: 'new.mp4',
        localPath: '/tmp/new.mp4',
        storage: 'local',
        r2Key: '',
        startedAt: new Date('2026-07-19T11:00:00Z'),
        endedAt: new Date('2026-07-19T11:20:00Z'),
        durationSec: 1200,
        createdAt: new Date('2026-07-19T11:20:00Z'),
      },
    ],
  };

  markRecordingPartUploaded(event, {
    filename: 'new.mp4',
    r2Key: 'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/new.mp4',
    r2Url: 'https://example/new.mp4',
    sizeBytes: 999,
  });

  const parts = listActiveRecordingParts(event);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].r2Key, 'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/old.mp4');
  assert.equal(parts[1].storage, 'r2');
  assert.equal(parts[1].r2Key, 'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/new.mp4');
  assert.equal(event.recordingR2Key, 'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/new.mp4');
});

test('removeRecordingPart deletes only one part', () => {
  const event = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    recordings: [
      {
        _id: '111111111111111111111111',
        filename: 'a.mp4',
        storage: 'r2',
        r2Key: 'recordings/a/a.mp4',
        startedAt: new Date('2026-07-19T10:00:00Z'),
        durationSec: 60,
        createdAt: new Date('2026-07-19T10:00:00Z'),
      },
      {
        _id: '222222222222222222222222',
        filename: 'b.mp4',
        storage: 'r2',
        r2Key: 'recordings/a/b.mp4',
        startedAt: new Date('2026-07-19T11:00:00Z'),
        durationSec: 90,
        createdAt: new Date('2026-07-19T11:00:00Z'),
      },
    ],
  };

  const cleanup = removeRecordingPart(event, '111111111111111111111111');
  assert.equal(cleanup.r2Key, 'recordings/a/a.mp4');
  assert.equal(listActiveRecordingParts(event).length, 1);
  assert.equal(event.recordingR2Key, 'recordings/a/b.mp4');
  const state = getRecordingState(event);
  assert.equal(state.recordingCount, 1);
  assert.equal(state.parts[0].part, 1);
});

test('legacy single recordingR2Key hydrates as one part', () => {
  const event = {
    _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    recordingStorage: 'r2',
    recordingR2Key: 'recordings/bbbbbbbbbbbbbbbbbbbbbbbb/solo.mp4',
    recordingR2Url: 'https://example/solo.mp4',
    recordingFilename: 'solo.mp4',
    recordingDurationSec: 42,
    recordingRecordedAt: new Date('2026-07-18T12:00:00Z'),
    recordings: [],
  };
  syncLegacyRecordingFields(event);
  const state = getRecordingState(event);
  assert.equal(state.hasRecording, true);
  assert.equal(state.recordingCount, 1);
  assert.equal(state.parts[0].filename, 'solo.mp4');
});
