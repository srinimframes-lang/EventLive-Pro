import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecordingR2Key,
  isSignedUrlExpired,
  parseByteRange,
  recordingPlaybackStatus,
  resolveRecordingPlaybackSource,
  sameOriginRecordingPlayUrl,
  RECORDING_SIGNED_URL_EXPIRES_SEC,
} from './recordingPlayback.js';

test('buildRecordingR2Key uses recordings/<eventId>/<filename>', () => {
  assert.equal(
    buildRecordingR2Key('aaaaaaaaaaaaaaaaaaaaaaaa', '2026-08-19_04-00-00.mp4'),
    'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/2026-08-19_04-00-00.mp4'
  );
  assert.equal(buildRecordingR2Key('', 'a.mp4'), '');
  assert.equal(buildRecordingR2Key('id', '../secret.mp4'), 'recordings/id/secret.mp4');
});

test('sameOriginRecordingPlayUrl is the player source path', () => {
  assert.equal(
    sameOriginRecordingPlayUrl('https://stream.eventlivepro.com', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
    'https://stream.eventlivepro.com/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording'
  );
  assert.equal(
    sameOriginRecordingPlayUrl('https://stream.eventlivepro.com', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'part1'),
    'https://stream.eventlivepro.com/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording?part=part1'
  );
});

test('recordingPlaybackStatus: completed VOD is replay, not reconnecting', () => {
  assert.equal(
    recordingPlaybackStatus({
      isLive: false,
      reconnecting: false,
      hasRecording: true,
      publiclyVisible: true,
    }),
    'replay'
  );
  assert.equal(
    recordingPlaybackStatus({
      isLive: true,
      reconnecting: true,
      hasRecording: true,
    }),
    'reconnecting'
  );
  assert.equal(
    recordingPlaybackStatus({
      isLive: false,
      hasRecording: false,
      mergeStatus: 'pending',
    }),
    'processing'
  );
});

test('missing R2 object falls back to local or reports missing', () => {
  const rec = { recordingR2Key: 'recordings/e/a.mp4' };
  const part = { storage: 'r2', r2Key: 'recordings/e/a.mp4' };
  assert.deepEqual(
    resolveRecordingPlaybackSource({
      part,
      rec,
      localExists: false,
      r2Head: { exists: false, size: 0 },
    }),
    { kind: 'missing', r2Key: 'recordings/e/a.mp4', reason: 'r2-missing' }
  );
  assert.equal(
    resolveRecordingPlaybackSource({
      part,
      rec,
      localExists: true,
      r2Head: { exists: false, size: 0 },
    }).kind,
    'local'
  );
  assert.equal(
    resolveRecordingPlaybackSource({
      part,
      rec,
      localExists: false,
      r2Head: { exists: true, size: 99 },
    }).kind,
    'r2'
  );
});

test('HTTP Range requests: 206 partial and 416 unsatisfiable', () => {
  const full = parseByteRange('', 1000);
  assert.equal(full.status, 200);
  assert.equal(full.contentLength, 1000);

  const mid = parseByteRange('bytes=100-199', 1000);
  assert.equal(mid.status, 206);
  assert.equal(mid.start, 100);
  assert.equal(mid.end, 199);
  assert.equal(mid.contentLength, 100);
  assert.equal(mid.contentRange, 'bytes 100-199/1000');

  const tail = parseByteRange('bytes=500-', 1000);
  assert.equal(tail.status, 206);
  assert.equal(tail.start, 500);
  assert.equal(tail.end, 999);

  const suffix = parseByteRange('bytes=-200', 1000);
  assert.equal(suffix.start, 800);
  assert.equal(suffix.end, 999);

  const bad = parseByteRange('bytes=5000-6000', 1000);
  assert.equal(bad.status, 416);
  assert.equal(bad.contentRange, 'bytes */1000');
});

test('expired signed URL is detected from X-Amz-Expires', () => {
  const url =
    'https://bucket.r2.cloudflarestorage.com/recordings/e/a.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260820T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc';
  assert.equal(isSignedUrlExpired(url, { now: Date.parse('2026-08-20T00:30:00Z') }), false);
  assert.equal(isSignedUrlExpired(url, { now: Date.parse('2026-08-20T01:00:01Z') }), true);
  assert.equal(isSignedUrlExpired('/api/events/e/stream/recording'), false);
  assert.equal(RECORDING_SIGNED_URL_EXPIRES_SEC, 24 * 3600);
});
