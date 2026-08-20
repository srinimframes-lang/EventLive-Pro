import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTemporaryRecordingFallback,
  livePollIntervalMs,
  mergeLivePriorityConfig,
  LIVE_PRIORITY_POLL_MS,
} from './livePriority.js';

test('completed VOD does not enter live reconnect state', () => {
  const endedReplay = {
    isLive: false,
    reconnecting: false,
    isPublishing: false,
    playbackMode: 'recorded',
    status: 'ended',
    recordingUrl: '/api/events/e/stream/recording',
    recordings: [{ id: '1', part: 1, durationSec: 21600 }],
    liveEndedAt: new Date(Date.now() - 60_000).toISOString(),
  };
  assert.equal(isTemporaryRecordingFallback(endedReplay), false);

  const missingEndedAt = {
    ...endedReplay,
    liveEndedAt: null,
  };
  assert.equal(isTemporaryRecordingFallback(missingEndedAt), false);

  const publishing = {
    ...endedReplay,
    isPublishing: true,
    playbackMode: 'live',
  };
  assert.equal(isTemporaryRecordingFallback(publishing), true);

  const reconnecting = {
    ...endedReplay,
    playbackMode: 'reconnecting',
    reconnecting: true,
  };
  assert.equal(isTemporaryRecordingFallback(reconnecting), true);
});

test('mergeLivePriorityConfig clears reconnecting when not live', () => {
  const merged = mergeLivePriorityConfig(
    {
      isLive: false,
      reconnecting: true,
      recordingUrl: '/api/events/e/stream/recording',
      recordings: [{ id: '1' }],
      playbackMode: 'recorded',
    },
    { isLive: false, reconnecting: false }
  );
  assert.equal(merged.isLive, false);
  assert.equal(merged.reconnecting, false);
  assert.equal(isTemporaryRecordingFallback(merged), false);
});

test('settled replay uses slower poll, not live-priority 3s', () => {
  const settled = {
    isLive: false,
    playbackMode: 'recorded',
    isPublishing: false,
    recordingUrl: '/api/events/e/stream/recording',
    recordings: [{ id: '1' }],
  };
  assert.ok(livePollIntervalMs(settled) > LIVE_PRIORITY_POLL_MS);
});
