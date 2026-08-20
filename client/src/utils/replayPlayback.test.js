import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampReplaySeek,
  firstReplayPartIndex,
  isReplayVodState,
  nextReplayActionAfterError,
  shouldRestoreReplaySeek,
} from './replayPlayback.js';

test('clampReplaySeek uses trusted duration instead of 24h container', () => {
  assert.equal(clampReplaySeek({ saved: 5265, trustedDurationSec: 23612, videoDuration: 89791 }), 5265);
  assert.equal(clampReplaySeek({ saved: 50000, trustedDurationSec: 23612, videoDuration: 89791 }), 0);
  assert.equal(clampReplaySeek({ saved: 0, trustedDurationSec: 23612, videoDuration: 89791 }), 0);
});

test('shouldRestoreReplaySeek waits for data and a video frame', () => {
  assert.equal(
    shouldRestoreReplaySeek({
      readyState: 1,
      videoWidth: 1280,
      saved: 100,
      trustedDurationSec: 23612,
      videoDuration: 23612,
    }),
    false
  );
  assert.equal(
    shouldRestoreReplaySeek({
      readyState: 2,
      videoWidth: 0,
      saved: 100,
      trustedDurationSec: 23612,
      videoDuration: 23612,
    }),
    false
  );
  assert.equal(
    shouldRestoreReplaySeek({
      readyState: 2,
      videoWidth: 1280,
      saved: 100,
      trustedDurationSec: 23612,
      videoDuration: 23612,
    }),
    true
  );
});

test('completed recording is VOD, not reconnecting', () => {
  assert.equal(isReplayVodState({ playbackMode: 'recorded', isLive: false, reconnecting: false }), true);
  assert.equal(isReplayVodState({ playbackMode: 'recorded', isLive: true }), false);
  assert.equal(isReplayVodState({ playbackMode: 'recorded', reconnecting: true }), false);
});

test('firstReplayPartIndex skips audio-only merged when originals are listed', () => {
  const parts = [
    { id: 'merged', filename: 'merged_1786916022256.mp4' },
    { id: 'orig', filename: '2026-08-16_18-26-15-800755.mp4' },
  ];
  assert.equal(firstReplayPartIndex(parts), 1);
  assert.equal(firstReplayPartIndex([{ id: 'merged', filename: 'merged_1.mp4' }]), 0);
});

test('nextReplayActionAfterError retries then advances parts, never reconnects', () => {
  assert.equal(
    nextReplayActionAfterError({ retriedSamePart: false, partIndex: 0, partCount: 5 }),
    'retry-same-part'
  );
  assert.equal(
    nextReplayActionAfterError({ retriedSamePart: true, partIndex: 0, partCount: 5 }),
    'next-part'
  );
  assert.equal(
    nextReplayActionAfterError({ retriedSamePart: true, partIndex: 4, partCount: 5 }),
    'fail'
  );
});
