import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampReplaySeek,
  isReplayVodState,
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
