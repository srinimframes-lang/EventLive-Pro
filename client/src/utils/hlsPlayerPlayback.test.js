import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHlsConfig,
  clampDvrSeek,
  cloudflareRecordedHlsPlayerProps,
  cloudflareExpectedVodDurationSec,
  isRecordedVodAtNaturalEnd,
  liveEdgeSeekTarget,
  recordedHlsStartPosition,
  selectCloudflareHlsPlayback,
  shouldFinishRecordedVod,
  shouldRetryOrRemountHls,
  shouldSeekHlsToLiveEdge,
  shouldSeekToLiveEdgeOnResume,
  cloudflarePlaybackErrorUiMode,
  CLOUDFLARE_RECORDING_PREPARING_MESSAGE,
  LIVE_WAITING_MESSAGE,
  shouldShowLiveBadge,
  hlsPlayerLiveMode,
  clampVodSeek,
  vodTimelineSeek,
  vodSeekMustNotRemountHls,
  resolveHlsPlayerSession,
  cloudflareHlsMountKey,
} from './hlsPlayerPlayback.js';
import { shouldPlayYoutubeBackup } from './streamFailover.js';
import { mergeLivePriorityConfig } from './livePriority.js';

const CF_LIVE =
  'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
const CF_VOD =
  'https://customer-test.cloudflarestream.com/cccccccccccccccccccccccccccccccc/manifest/video.m3u8';
const MTX_HLS = 'https://stream.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/index.m3u8';

function recordedConfig(overrides = {}) {
  return {
    provider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    playbackMode: 'recorded',
    isLive: false,
    isPublishing: false,
    playbackUrl: CF_VOD,
    hlsUrl: CF_VOD,
    recordingUrl: '',
    cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
    cfStreamLiveInputId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ...overrides,
  };
}

function liveConfig(overrides = {}) {
  return {
    provider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
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

test('VOD end unmounts replay and shows Waiting for live', () => {
  assert.equal(isRecordedVodAtNaturalEnd({ ended: true, duration: 60, currentTime: 60 }), true);
  assert.equal(
    isRecordedVodAtNaturalEnd({ ended: false, duration: 120, currentTime: 119.8 }),
    true
  );
  assert.equal(shouldRetryOrRemountHls({ recorded: true, atNaturalEnd: true }), false);
  assert.equal(shouldRetryOrRemountHls({ recorded: true, atNaturalEnd: false }), false);

  const ended = selectCloudflareHlsPlayback({
    config: recordedConfig({ isLive: false }),
    hlsLiveResume: true,
    recordedVodEnded: true,
  });
  assert.equal(ended?.mode, 'waiting-for-live');
  assert.equal(ended.showWaitingForLive, true);
  assert.equal(ended.retryOrRemount, false);
  assert.equal(ended.isLive, false);
  assert.equal(ended.continueLiveStatusPolling, true);
});

test('existing cfStreamVideoUid uses recorded HLS and never waits for live', () => {
  const vod = selectCloudflareHlsPlayback({
    config: recordedConfig({ cfRecordingPreparing: false }),
  });
  assert.equal(vod?.mode, 'recorded');
  assert.equal(vod.src, CF_VOD);
  assert.equal(vod.showWaitingForLive, false);
  assert.equal(vod.hlsPlayer.detectPublish, false);
});

test('offline Cloudflare HLS without liveIngestProvider prepares instead of waiting', () => {
  const preparing = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      playbackUrl: CF_LIVE,
      hlsUrl: CF_LIVE,
      recordingUrl: '',
    },
  });
  assert.equal(preparing?.mode, 'recording-preparing');
  assert.equal(preparing.showWaitingForLive, false);
});

test('recording still processing shows preparing, not Waiting for live', () => {
  const preparing = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      playbackUrl: CF_LIVE,
      hlsUrl: CF_LIVE,
      recordingUrl: '',
      cfRecordingPreparing: true,
    },
  });
  assert.equal(preparing?.mode, 'recording-preparing');
  assert.equal(preparing.showWaitingForLive, false);
  assert.equal(preparing.retryOrRemount, false);
  assert.equal(preparing.continueLiveStatusPolling, true);
});

test('offline two days later with recorded URL stays on VOD', () => {
  const vod = selectCloudflareHlsPlayback({
    config: recordedConfig({
      status: 'ended',
      liveEndedAt: '2026-09-04T10:00:00.000Z',
    }),
  });
  assert.equal(vod?.mode, 'recorded');
  assert.equal(vod.src, CF_VOD);
  assert.doesNotMatch(vod.src, /dvrEnabled=true/);
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

test('offline recorded VOD is not the live/DVR URL and starts at 0', () => {
  const vod = selectCloudflareHlsPlayback({ config: recordedConfig() });
  assert.equal(vod?.mode, 'recorded');
  assert.equal(vod.src, CF_VOD);
  assert.doesNotMatch(vod.src, /dvrEnabled=true/);
  assert.notEqual(vod.src, CF_LIVE);
  assert.equal(vod.startPosition, 0);
  assert.equal(vod.hlsPlayer.isLive, false);
  assert.equal(vod.hlsPlayer.recorded, true);

  const liveAsRecorded = selectCloudflareHlsPlayback({
    config: recordedConfig({
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
    }),
  });
  assert.equal(liveAsRecorded?.mode, 'recording-preparing');
  assert.equal(liveAsRecorded.showWaitingForLive, false);

  const refreshed = selectCloudflareHlsPlayback({ config: recordedConfig() });
  assert.equal(refreshed.src, vod.src);
  assert.equal(refreshed.startPosition, 0);
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

test('3-minute Cloudflare live then offline plays the full finite VOD from 0:00', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const vodUid = 'cccccccccccccccccccccccccccccccc';
  const liveUrl = `${CF_LIVE}?dvrEnabled=true`;
  const vodUrl = CF_VOD;

  const whileLive = selectCloudflareHlsPlayback({
    config: liveConfig({
      cfStreamLiveInputId: liveInputId,
      playbackUrl: liveUrl,
      hlsUrl: liveUrl,
    }),
  });
  assert.equal(whileLive?.mode, 'live');
  assert.match(whileLive.src, /dvrEnabled=true/);

  const afterStop = selectCloudflareHlsPlayback({
    config: recordedConfig({
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: vodUid,
      cfStreamVideoDurationSec: 180,
      playbackUrl: vodUrl,
      hlsUrl: vodUrl,
    }),
  });
  assert.equal(afterStop?.mode, 'recorded');
  assert.equal(afterStop.src, vodUrl);
  assert.doesNotMatch(afterStop.src, /dvrEnabled=true/);
  assert.notEqual(afterStop.src, liveUrl);
  assert.equal(afterStop.startPosition, 0);
  assert.equal(afterStop.expectedDurationSec, 180);
  assert.equal(cloudflareExpectedVodDurationSec(recordedConfig({ cfStreamVideoDurationSec: 180 })), 180);
  assert.equal(
    shouldFinishRecordedVod({
      ended: true,
      currentTime: 30,
      duration: 30,
      expectedDurationSec: 180,
    }),
    false,
  );
  assert.equal(
    shouldFinishRecordedVod({
      ended: true,
      currentTime: 179.8,
      duration: 180,
      expectedDurationSec: 180,
    }),
    true,
  );
});

test('Live Input UID and 30-second live/DVR clip are never used for offline playback', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const liveAsUid = selectCloudflareHlsPlayback({
    config: recordedConfig({
      cfStreamVideoUid: liveInputId,
      cfStreamLiveInputId: liveInputId,
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
      cfStreamVideoDurationSec: 32,
    }),
  });
  assert.equal(liveAsUid?.mode, 'recording-preparing');

  const trailingClip = selectCloudflareHlsPlayback({
    config: recordedConfig({
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
      cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
      cfStreamVideoDurationSec: 180,
    }),
  });
  assert.equal(trailingClip?.mode, 'recording-preparing');
  assert.equal(
    isRecordedVodAtNaturalEnd({ ended: true, currentTime: 30, duration: 30 }, 180),
    false,
  );
});

test('processing VOD stays preparing until the persisted UID is ready', () => {
  const preparing = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      playbackUrl: '',
      hlsUrl: '',
      recordingUrl: '',
      cfRecordingPreparing: true,
      cfStreamLiveInputId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      cfStreamVideoUid: '',
    },
  });
  assert.equal(preparing?.mode, 'recording-preparing');

  const ready = selectCloudflareHlsPlayback({
    config: recordedConfig({ cfStreamVideoDurationSec: 180 }),
  });
  assert.equal(ready?.mode, 'recorded');
  assert.equal(ready.src, CF_VOD);
});

test('refresh keeps the persisted VOD UID and starts at 0:00', () => {
  const persisted = recordedConfig({ cfStreamVideoDurationSec: 190 });
  const first = selectCloudflareHlsPlayback({ config: persisted });
  const afterRefresh = selectCloudflareHlsPlayback({ config: { ...persisted } });
  assert.equal(first?.mode, 'recorded');
  assert.equal(afterRefresh.src, first.src);
  assert.equal(afterRefresh.src, CF_VOD);
  assert.equal(afterRefresh.startPosition, 0);
  assert.equal(afterRefresh.expectedDurationSec, 190);
  assert.doesNotMatch(afterRefresh.src, /dvrEnabled=true/);
  assert.notEqual(afterRefresh.src.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);
});

test('5-minute Cloudflare live then offline plays the full finite VOD from 0:00 through EOS', () => {
  const fiveMin = recordedConfig({
    youtubeVideoId: 'SKeFP6sPJ3U',
    failoverFeatureEnabled: true,
    activeSource: 'server',
    viewerPlayback: 'hls',
    cfStreamVideoDurationSec: 310,
    playbackUrl: CF_VOD,
    hlsUrl: CF_VOD,
  });
  const liveDvr = liveConfig({
    youtubeVideoId: 'SKeFP6sPJ3U',
    playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
    hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
  });
  assert.equal(selectCloudflareHlsPlayback({ config: liveDvr })?.mode, 'live');

  const vod = selectCloudflareHlsPlayback({ config: fiveMin });
  assert.equal(vod?.mode, 'recorded');
  assert.equal(vod.src, CF_VOD);
  assert.equal(vod.startPosition, 0);
  assert.equal(vod.seekToLiveEdge, false);
  assert.equal(vod.playThroughEos, true);
  assert.equal(vod.expectedDurationSec, 310);
  assert.doesNotMatch(vod.src, /dvrEnabled=true/);
  assert.equal(
    shouldPlayYoutubeBackup({
      ...fiveMin,
      failoverFeatureEnabled: true,
      activeSource: 'server',
    }),
    false,
  );
  assert.equal(
    shouldFinishRecordedVod({
      ended: true,
      currentTime: 10,
      duration: 10,
      expectedDurationSec: 310,
    }),
    false,
  );
  assert.equal(
    shouldFinishRecordedVod({
      ended: true,
      currentTime: 309.8,
      duration: 310,
      expectedDurationSec: 310,
    }),
    true,
  );

  const afterRefresh = selectCloudflareHlsPlayback({ config: { ...fiveMin } });
  assert.equal(afterRefresh.src, vod.src);
  assert.equal(afterRefresh.startPosition, 0);
  assert.equal(afterRefresh.expectedDurationSec, 310);
});

test('offline Cloudflare VOD wins over live/DVR/YouTube when a completed VOD exists', () => {
  const vod = selectCloudflareHlsPlayback({
    config: recordedConfig({
      youtubeVideoId: 'SKeFP6sPJ3U',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=SKeFP6sPJ3U',
      failoverFeatureEnabled: true,
      activeSource: 'server',
      playbackUrl: CF_VOD,
    }),
  });
  assert.equal(vod?.mode, 'recorded');
  assert.equal(vod.src, CF_VOD);

  const dvrOffline = selectCloudflareHlsPlayback({
    config: recordedConfig({
      youtubeVideoId: 'SKeFP6sPJ3U',
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
    }),
  });
  assert.equal(dvrOffline?.mode, 'recording-preparing');
});

test('5-minute live → OBS stop → preparing → ready VOD → refresh', () => {
  const liveInputId = 'd0e9aac6ba383336f6f554943a995628';
  const vodUid = 'aa56098453fdf44646f9d132ea1ec1eb';
  const liveUrl = `${CF_LIVE}?dvrEnabled=true`;
  const vodUrl = `https://customer-test.cloudflarestream.com/${vodUid}/manifest/video.m3u8`;

  const live = selectCloudflareHlsPlayback({
    config: liveConfig({
      cfStreamLiveInputId: liveInputId,
      playbackUrl: liveUrl,
      hlsUrl: liveUrl,
      isPublishing: true,
    }),
  });
  assert.equal(live?.mode, 'live');

  const afterStop = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      cfRecordingPreparing: true,
      playbackUrl: '',
      hlsUrl: '',
      recordingUrl: '',
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: '',
      youtubeVideoId: 'SKeFP6sPJ3U',
    },
    hlsLiveResume: true,
  });
  assert.equal(afterStop?.mode, 'recording-preparing');
  assert.equal(afterStop.showWaitingForLive, false);
  assert.equal(afterStop.src, undefined);
  assert.equal(afterStop.ignoreHlsLiveResume, true);

  const leftoverDvr = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      playbackUrl: liveUrl,
      hlsUrl: liveUrl,
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: '',
    },
  });
  assert.equal(leftoverDvr?.mode, 'recording-preparing');
  assert.doesNotMatch(String(leftoverDvr.src || ''), /dvrEnabled=true/);

  assert.equal(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      cfRecordingPreparing: true,
    }),
    'recording-preparing',
  );
  assert.notEqual(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      cfRecordingPreparing: true,
    }),
    'waiting-for-live',
  );
  assert.match(CLOUDFLARE_RECORDING_PREPARING_MESSAGE, /preparing/i);

  const ready = selectCloudflareHlsPlayback({
    config: recordedConfig({
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: vodUid,
      cfStreamVideoDurationSec: 310,
      playbackUrl: vodUrl,
      hlsUrl: vodUrl,
    }),
  });
  assert.equal(ready?.mode, 'recorded');
  assert.equal(ready.src, vodUrl);
  assert.equal(ready.startPosition, 0);
  assert.equal(ready.autoStart, true);
  assert.equal(ready.playThroughEos, true);
  assert.equal(ready.expectedDurationSec, 310);
  assert.doesNotMatch(ready.src, /dvrEnabled=true/);
  assert.equal(ready.src.includes(liveInputId), false);

  const refreshed = selectCloudflareHlsPlayback({
    config: recordedConfig({
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: vodUid,
      cfStreamVideoDurationSec: 310,
      playbackUrl: vodUrl,
      hlsUrl: vodUrl,
    }),
  });
  assert.equal(refreshed.src, ready.src);
  assert.equal(refreshed.startPosition, 0);
  assert.equal(refreshed.expectedDurationSec, 310);
});

test('leftover 10–20s Live Input DVR after OBS stop is never Waiting for live', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const leftover = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'live',
      isLive: true,
      isPublishing: false,
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: '',
    },
  });
  assert.equal(leftover?.mode, 'recording-preparing');
  assert.equal(leftover.sourceType, 'none');
  assert.equal(leftover.showWaitingForLive, false);
  assert.equal(leftover.retryOrRemount, false);
  assert.equal(shouldRetryOrRemountHls({ recorded: false, atNaturalEnd: true }), false);
  assert.equal(shouldRetryOrRemountHls({ recorded: false, cloudflareSessionEnded: true }), false);
  assert.equal(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'live',
      isLive: true,
      isPublishing: false,
    }),
    'recording-preparing',
  );
  assert.notEqual(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: true,
      isPublishing: false,
      recorded: false,
    }),
    'waiting-for-live',
  );
});

test('temporary VOD HLS error stays recording-preparing, never live/DVR', () => {
  assert.equal(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      cfRecordingPreparing: true,
      recorded: false,
    }),
    'recording-preparing',
  );
  assert.equal(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'recorded',
      isLive: false,
      recorded: true,
    }),
    'recorded',
  );
  const preparing = selectCloudflareHlsPlayback({
    config: {
      provider: 'rtmp',
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'offline',
      isLive: false,
      isPublishing: false,
      cfRecordingPreparing: true,
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
    },
    hlsLiveResume: true,
  });
  assert.equal(preparing?.mode, 'recording-preparing');
  assert.equal(preparing.src, undefined);
  assert.equal(preparing.showWaitingForLive, false);
});

test('new OBS live after previous VOD uses Live Input DVR, not the old VOD', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const oldVod = 'cccccccccccccccccccccccccccccccc';
  const live = selectCloudflareHlsPlayback({
    config: liveConfig({
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: oldVod,
      cfStreamVideoDurationSec: 344,
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
      cfStreamPlaybackHlsUrl: CF_VOD,
    }),
    recordedVodEnded: true,
  });
  assert.equal(live?.mode, 'live');
  assert.equal(live.sourceType, 'live');
  assert.match(live.src, /dvrEnabled=true/);
  assert.equal(live.src.includes(oldVod), false);
  assert.equal(live.allowBackwardSeek, true);
  assert.equal(live.hlsPlayer.recorded, false);
  assert.equal(live.showWaitingForLive, false);
});

test('OFFLINE + finite VOD is never treated as LIVE (seek, badge, remount, error, refresh)', () => {
  const duration = 235.43;
  const staleLiveSocket = { isLive: true, playbackMode: 'live', reconnecting: false };
  const restOfflineVod = recordedConfig({
    status: 'ended',
    isLive: false,
    isPublishing: false,
    playbackMode: 'recorded',
    cfStreamVideoDurationSec: duration,
    playbackUrl: `${CF_VOD}?dvrEnabled=true`,
    hlsUrl: `${CF_VOD}?dvrEnabled=true`,
    cfStreamPlaybackHlsUrl: CF_VOD,
  });
  const merged = mergeLivePriorityConfig(restOfflineVod, staleLiveSocket);
  const vod = selectCloudflareHlsPlayback({ config: merged, hlsLiveResume: true });
  const session = resolveHlsPlayerSession({
    src: vod.src,
    recorded: vod.hlsPlayer.recorded,
    isLive: vod.hlsPlayer.isLive,
    detectPublish: vod.hlsPlayer.detectPublish,
    videoUid: restOfflineVod.cfStreamVideoUid,
    liveInputId: restOfflineVod.cfStreamLiveInputId,
    mode: vod.mode,
  });

  // 1. OFFLINE + finite VOD => isLive=false
  assert.equal(merged.isLive, false);
  assert.equal(vod.mode, 'recorded');
  assert.equal(vod.isLive, false);
  assert.equal(vod.hlsPlayer.isLive, false);
  assert.equal(vod.hlsPlayer.recorded, true);
  assert.equal(vod.hlsPlayer.detectPublish, false);
  assert.equal(session.isLive, false);
  assert.equal(session.recorded, true);
  assert.equal(session.hlsConfig.liveDurationInfinity, false);
  assert.equal(session.hlsConfig.startPosition, 0);
  assert.doesNotMatch(vod.src, /dvrEnabled=true/);

  // 2. LIVE badge is not shown
  assert.equal(vod.showLiveBadge, false);
  assert.equal(session.showLiveBadge, false);
  assert.equal(session.liveChrome, false);
  assert.equal(shouldShowLiveBadge({ recorded: true, isLive: false, mode: 'recorded' }), false);
  assert.equal(hlsPlayerLiveMode({ recorded: true, isLive: true }), false);

  // 3–5. VOD seek backward / forward / timeline drag stay inside the finite file
  assert.equal(vodTimelineSeek({ currentTime: 90, duration, action: 'backward' }), 75);
  assert.equal(vodTimelineSeek({ currentTime: 90, duration, action: 'forward' }), 105);
  assert.equal(vodTimelineSeek({ currentTime: 90, duration, expectedDurationSec: duration, action: 'drag' }), duration * 0.6);
  assert.equal(clampVodSeek({ currentTime: 90, duration, target: -10, expectedDurationSec: duration }), 0);
  assert.equal(clampVodSeek({ currentTime: 90, duration, target: 999, expectedDurationSec: duration }), duration);

  // 6. VOD seek must not remount into live mode
  const keyBefore = cloudflareHlsMountKey({ mode: vod.mode, eventId: 'evt' });
  const keyAfterSeek = cloudflareHlsMountKey({ mode: 'recorded', eventId: 'evt' });
  assert.equal(keyBefore, 'cf-vod-evt');
  assert.equal(keyAfterSeek, keyBefore);
  assert.equal(vodSeekMustNotRemountHls(), true);
  assert.equal(session.remountOnSeek, false);
  assert.equal(session.seekToLiveEdge, false);
  assert.equal(shouldSeekHlsToLiveEdge({ recorded: true }), false);
  assert.equal(shouldRetryOrRemountHls({ recorded: true, atNaturalEnd: false }), false);

  // 7. VOD playback error must not become "Waiting for live..."
  assert.equal(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'recorded',
      isLive: false,
      recorded: true,
    }),
    'recorded',
  );
  assert.notEqual(
    cloudflarePlaybackErrorUiMode({
      liveIngestProvider: 'cloudflare_stream',
      playbackMode: 'recorded',
      isLive: true,
      recorded: true,
    }),
    'waiting-for-live',
  );
  assert.notEqual(LIVE_WAITING_MESSAGE, vod.mode);

  // 8. Refresh preserves the same VOD
  const refreshed = selectCloudflareHlsPlayback({ config: { ...merged } });
  assert.equal(refreshed.mode, 'recorded');
  assert.equal(refreshed.src, vod.src);
  assert.equal(refreshed.hlsPlayer.recorded, true);
  assert.equal(refreshed.isLive, false);

  // 9. stale socket isLive=true cannot override REST OFFLINE
  assert.equal(merged.isLive, false);
  assert.equal(merged.playbackMode, 'recorded');
  assert.notEqual(selectCloudflareHlsPlayback({ config: merged })?.mode, 'live');
});

test('new OBS session switches persisted VOD to LIVE DVR', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const nextLive = selectCloudflareHlsPlayback({
    config: liveConfig({
      status: 'live',
      cfStreamLiveInputId: liveInputId,
      cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
      cfStreamPlaybackHlsUrl: CF_VOD,
      playbackUrl: `${CF_LIVE}?dvrEnabled=true`,
      hlsUrl: `${CF_LIVE}?dvrEnabled=true`,
    }),
    recordedVodEnded: true,
  });
  assert.equal(nextLive?.mode, 'live');
  assert.equal(nextLive.isLive, true);
  assert.equal(nextLive.hlsPlayer.recorded, false);
  assert.equal(nextLive.showLiveBadge, true);
  assert.match(nextLive.src, /dvrEnabled=true/);
  assert.equal(nextLive.src.includes('cccccccccccccccccccccccccccccccc'), false);
  assert.equal(cloudflareHlsMountKey({ mode: nextLive.mode, eventId: 'evt' }), 'live-evt');
});

test('LIVE session still supports backward DVR seek and Go Live', () => {
  const live = selectCloudflareHlsPlayback({ config: liveConfig() });
  const session = resolveHlsPlayerSession({
    src: live.src,
    recorded: false,
    isLive: true,
    detectPublish: true,
    videoUid: '',
    liveInputId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    mode: 'live',
  });
  assert.equal(live.mode, 'live');
  assert.equal(live.allowBackwardSeek, true);
  assert.equal(live.seekToLiveEdge, true);
  assert.equal(session.liveChrome, true);
  assert.equal(session.showLiveBadge, true);
  assert.equal(session.cloudflareDvr, true);
  assert.equal(
    clampDvrSeek({ currentTime: 80, seekableStart: 0, seekableEnd: 100, target: 25 }),
    25
  );
  assert.equal(liveEdgeSeekTarget({ liveSyncPosition: 99.2, seekableEnd: 100 }), 99.2);
  assert.equal(shouldSeekHlsToLiveEdge({ recorded: false }), true);
});

test('finite VOD URL never enters the live HLS branch even if isLive is stale', () => {
  const poisoned = selectCloudflareHlsPlayback({
    config: {
      ...recordedConfig({
        isLive: true,
        playbackMode: 'live',
        status: 'ended',
        playbackUrl: `${CF_VOD}?dvrEnabled=true`,
        hlsUrl: `${CF_VOD}?dvrEnabled=true`,
      }),
    },
  });
  assert.equal(poisoned?.mode, 'recorded');
  assert.equal(poisoned.isLive, false);
  assert.equal(poisoned.hlsPlayer.recorded, true);
  assert.equal(poisoned.showLiveBadge, false);
  assert.doesNotMatch(poisoned.src, /dvrEnabled=true/);
  const forced = resolveHlsPlayerSession({
    src: CF_VOD,
    recorded: false,
    isLive: true,
    detectPublish: true,
    videoUid: 'cccccccccccccccccccccccccccccccc',
    liveInputId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(forced.recorded, true);
  assert.equal(forced.isLive, false);
  assert.equal(forced.detectPublish, false);
  assert.equal(forced.liveChrome, false);
  assert.equal(forced.hlsConfig.liveDurationInfinity, false);
});

