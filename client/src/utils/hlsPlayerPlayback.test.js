import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHlsConfig,
  clampDvrSeek,
  cloudflareRecordedHlsPlayerProps,
  isRecordedVodAtNaturalEnd,
  liveEdgeSeekTarget,
  recordedHlsStartPosition,
  selectCloudflareHlsPlayback,
  shouldRetryOrRemountHls,
  shouldSeekHlsToLiveEdge,
  shouldSeekToLiveEdgeOnResume,
} from './hlsPlayerPlayback.js';

const CF_LIVE =
  'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
const CF_VOD =
  'https://customer-test.cloudflarestream.com/cccccccccccccccccccccccccccccccc/manifest/video.m3u8';
const MTX_HLS = 'https://stream.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/index.m3u8';

function recordedConfig(overrides = {}) {
  return {
    provider: 'hls',
    playbackMode: 'recorded',
    isLive: false,
    isPublishing: false,
    playbackUrl: CF_VOD,
    hlsUrl: CF_VOD,
    recordingUrl: '',
    cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
    ...overrides,
  };
}

function liveConfig(overrides = {}) {
  return {
    provider: 'hls',
    playbackMode: 'live',
    isLive: true,
    isPublishing: true,
    playbackUrl: CF_LIVE,
    hlsUrl: CF_LIVE,
    recordingUrl: '',
    ...overrides,
  };
}

function mtxLiveConfig(overrides = {}) {
  return {
    provider: 'hls',
    playbackMode: 'live',
    isLive: true,
    playbackUrl: MTX_HLS,
    hlsUrl: MTX_HLS,
    recordingUrl: '',
    ...overrides,
  };
}

test('live DVR backward seek', () => {
  const live = selectCloudflareHlsPlayback({ config: liveConfig() });
  assert.equal(live?.mode, 'live');
  assert.equal(live.allowBackwardSeek, true);
  assert.equal(live.cloudflareDvr, true);
  assert.equal(shouldSeekHlsToLiveEdge({ recorded: false }), true);

  assert.equal(
    clampDvrSeek({ currentTime: 90, seekableStart: 0, seekableEnd: 100, target: 40 }),
    40
  );
  assert.equal(
    clampDvrSeek({ currentTime: 90, seekableStart: 10, seekableEnd: 100, target: 0 }),
    10
  );
  assert.equal(
    clampDvrSeek({ currentTime: 90, seekableStart: 0, seekableEnd: 100, target: 120 }),
    100
  );

  const dvr = buildHlsConfig({ cloudflareDvr: true });
  assert.equal(dvr.liveDurationInfinity, true);
  assert.equal(dvr.liveMaxLatencyDurationCount, Infinity);
  assert.equal(dvr.backBufferLength, Infinity);
});

test('LIVE button returns to live edge', () => {
  assert.equal(liveEdgeSeekTarget({ liveSyncPosition: 88.5, seekableEnd: 90 }), 88.5);
  assert.equal(liveEdgeSeekTarget({ liveSyncPosition: NaN, seekableEnd: 90 }), 89.75);
  assert.equal(liveEdgeSeekTarget({}), null);
  assert.equal(shouldSeekToLiveEdgeOnResume({ cloudflareDvr: true, holdingDvr: true }), false);
  assert.equal(shouldSeekToLiveEdgeOnResume({ cloudflareDvr: true, holdingDvr: false }), false);
  const live = selectCloudflareHlsPlayback({ config: liveConfig() });
  assert.equal(live.seekToLiveEdge, true);
  assert.equal(live.hlsPlayer.isLive, true);
  assert.equal(live.hlsPlayer.recorded, false);
});

test('live DVR remains active while event is live', () => {
  const live = selectCloudflareHlsPlayback({
    config: liveConfig(),
    hlsLiveResume: true,
    recordedVodEnded: false,
  });
  assert.equal(live?.mode, 'live');
  assert.equal(live.isLive, true);
  assert.equal(live.cloudflareDvr, true);
  assert.equal(live.showWaitingForLive, false);
  assert.match(live.src, /dvrEnabled=true/);
  assert.equal(live.hlsPlayer.recorded, false);

  const stillLiveWithVodFields = selectCloudflareHlsPlayback({
    config: recordedConfig({
      isLive: true,
      isPublishing: true,
      playbackMode: 'recorded',
      playbackUrl: CF_LIVE,
      hlsUrl: CF_LIVE,
    }),
    recordedVodEnded: false,
  });
  assert.equal(stillLiveWithVodFields?.mode, 'live');
  assert.notEqual(stillLiveWithVodFields?.mode, 'recorded');
});

test('offline switches to VOD', () => {
  const vod = selectCloudflareHlsPlayback({
    config: recordedConfig(),
    hlsLiveResume: false,
    recordedVodEnded: false,
  });
  assert.equal(vod?.mode, 'recorded');
  assert.equal(vod.src, CF_VOD);
  assert.equal(vod.isLive, false);
  assert.equal(vod.cloudflareDvr, false);
  assert.equal(vod.showWaitingForLive, false);
  assert.equal(vod.hlsPlayer.isLive, false);
  assert.equal(vod.hlsPlayer.recorded, true);
  assert.doesNotMatch(vod.src, /dvrEnabled=true/);
});

test('VOD starts at beginning', () => {
  const cfg = buildHlsConfig({ recorded: true });
  assert.equal(cfg.startPosition, 0);
  assert.equal(recordedHlsStartPosition(), 0);
  const selected = selectCloudflareHlsPlayback({ config: recordedConfig() });
  assert.equal(selected.startPosition, 0);
  assert.equal(selected.seekToLiveEdge, false);
  const props = cloudflareRecordedHlsPlayerProps(CF_VOD);
  assert.equal(props.isLive, false);
  assert.equal(props.recorded, true);
});

test('VOD end → Waiting for Live', () => {
  assert.equal(isRecordedVodAtNaturalEnd({ ended: true, duration: 60, currentTime: 60 }), true);
  assert.equal(
    isRecordedVodAtNaturalEnd({ ended: false, duration: 120, currentTime: 119.8 }),
    true
  );
  assert.equal(shouldRetryOrRemountHls({ recorded: true, atNaturalEnd: true }), false);
  assert.equal(shouldRetryOrRemountHls({ recorded: true, atNaturalEnd: false }), false);

  const waiting = selectCloudflareHlsPlayback({
    config: recordedConfig({ isLive: false }),
    hlsLiveResume: true,
    recordedVodEnded: true,
  });
  assert.equal(waiting?.mode, 'waiting-for-live');
  assert.equal(waiting.showWaitingForLive, true);
  assert.equal(waiting.retryOrRemount, false);
  assert.equal(waiting.continueLiveStatusPolling, true);
});

test('next live → DVR live', () => {
  const nextLive = selectCloudflareHlsPlayback({
    config: liveConfig(),
    hlsLiveResume: false,
    recordedVodEnded: true,
  });
  assert.equal(nextLive?.mode, 'live');
  assert.equal(nextLive.isLive, true);
  assert.equal(nextLive.cloudflareDvr, true);
  assert.equal(nextLive.hlsPlayer.recorded, false);
  assert.equal(nextLive.showWaitingForLive, false);
  assert.match(nextLive.src, /dvrEnabled=true/);
  assert.equal(nextLive.continueLiveStatusPolling, true);
});

test('existing MediaMTX behavior unchanged', () => {
  assert.equal(
    selectCloudflareHlsPlayback({
      config: mtxLiveConfig(),
      recordedVodEnded: false,
    }),
    null
  );
  assert.equal(
    selectCloudflareHlsPlayback({
      config: {
        provider: 'hls',
        playbackMode: 'recorded',
        isLive: false,
        playbackUrl: MTX_HLS,
        recordingUrl: '/api/events/e/stream/recording',
      },
    }),
    null
  );

  const live = buildHlsConfig();
  assert.equal(live.liveDurationInfinity, true);
  assert.equal(live.liveSyncDurationCount, 3);
  assert.equal(live.backBufferLength, 90);
  assert.equal(live.maxBufferLength, 30);
  assert.equal(shouldSeekToLiveEdgeOnResume({ recorded: false, cloudflareDvr: false, holdingDvr: false }), true);
  assert.equal(shouldSeekToLiveEdgeOnResume({ recorded: false, cloudflareDvr: false, holdingDvr: true }), false);
  assert.equal(shouldRetryOrRemountHls({ recorded: false, atNaturalEnd: false }), true);
});
