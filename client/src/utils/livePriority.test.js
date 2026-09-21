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

test('Cloudflare recording-preparing polls quickly and ignores stale socket live', () => {
  const preparing = {
    isLive: false,
    playbackMode: 'offline',
    liveIngestProvider: 'cloudflare_stream',
    cfRecordingPreparing: true,
  };
  assert.equal(livePollIntervalMs(preparing), LIVE_PRIORITY_POLL_MS);

  const merged = mergeLivePriorityConfig(
    {
      isLive: false,
      isPublishing: false,
      playbackMode: 'offline',
      liveIngestProvider: 'cloudflare_stream',
      cfRecordingPreparing: true,
      playbackUrl: '',
      hlsUrl: '',
    },
    { isLive: false, playbackMode: 'live', reconnecting: false }
  );
  assert.equal(merged.isLive, false);
  assert.equal(merged.playbackMode, 'offline');
  assert.equal(merged.cfRecordingPreparing, true);
  assert.equal(merged.reconnecting, false);
});

test('YouTube + Server leftover Cloudflare ingest does not enter recording-preparing', () => {
  const merged = mergeLivePriorityConfig(
    {
      isLive: false,
      isPublishing: undefined,
      playbackMode: 'offline',
      status: 'published',
      provider: 'rtmp',
      streamingProvider: 'cloudflare_stream',
      viewerPlayback: 'cloudflare_stream',
      liveIngestProvider: 'cloudflare_stream',
      streamingDestination: 'youtube_server',
      cfRecordingPreparing: true,
      youtubeVideoId: 'dQw4w9WgXcQ',
    },
    { isLive: false, playbackMode: 'offline', reconnecting: false }
  );
  assert.equal(merged.cfRecordingPreparing, false);
  assert.equal(merged.playbackMode, 'offline');
  assert.equal(merged.isLive, false);
});

test('YouTube-only leftover Cloudflare ingest does not enter recording-preparing', () => {
  const merged = mergeLivePriorityConfig(
    {
      isLive: false,
      isPublishing: undefined,
      playbackMode: 'offline',
      status: 'published',
      provider: 'youtube',
      streamingProvider: 'youtube',
      viewerPlayback: 'cloudflare_stream',
      liveIngestProvider: 'cloudflare_stream',
      streamingDestination: 'youtube',
      cfRecordingPreparing: true,
      youtubeVideoId: 'dQw4w9WgXcQ',
    },
    { isLive: false, playbackMode: 'offline', reconnecting: false }
  );
  assert.equal(merged.cfRecordingPreparing, false);
  assert.equal(merged.playbackMode, 'offline');
  assert.equal(merged.isLive, false);
});

test('External Server Embed leftover Cloudflare ingest does not enter recording-preparing', () => {
  const merged = mergeLivePriorityConfig(
    {
      isLive: false,
      isPublishing: false,
      playbackMode: 'offline',
      status: 'published',
      streamingProvider: 'external_embed',
      viewerPlayback: 'external_embed',
      liveIngestProvider: 'cloudflare_stream',
      cfRecordingPreparing: true,
      externalEmbedType: 'iframe',
      externalEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    },
    { isLive: false, playbackMode: 'offline', reconnecting: false }
  );
  assert.equal(merged.cfRecordingPreparing, false);
  assert.equal(merged.playbackMode, 'offline');
});

test('stale socket isLive cannot keep Cloudflare leftover DVR after OBS stop', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const merged = mergeLivePriorityConfig(
    {
      isLive: false,
      isPublishing: false,
      playbackMode: 'offline',
      liveIngestProvider: 'cloudflare_stream',
      cfRecordingPreparing: true,
      cfStreamLiveInputId: liveInputId,
      playbackUrl: `https://customer-test.cloudflarestream.com/${liveInputId}/manifest/video.m3u8?dvrEnabled=true`,
      hlsUrl: `https://customer-test.cloudflarestream.com/${liveInputId}/manifest/video.m3u8?dvrEnabled=true`,
    },
    { isLive: true, playbackMode: 'live', reconnecting: false }
  );
  assert.equal(merged.isLive, false);
  assert.equal(merged.playbackMode, 'offline');
  assert.equal(merged.cfRecordingPreparing, true);
  assert.equal(merged.playbackUrl, '');
  assert.equal(merged.hlsUrl, '');
  assert.equal(String(merged.playbackUrl).includes('dvrEnabled'), false);
});

test('stale socket isLive cannot override REST ended Cloudflare VOD', () => {
  const vod = 'https://customer-test.cloudflarestream.com/cccccccccccccccccccccccccccccccc/manifest/video.m3u8';
  const merged = mergeLivePriorityConfig(
    {
      status: 'ended',
      isLive: false,
      isPublishing: false,
      playbackMode: 'recorded',
      liveIngestProvider: 'cloudflare_stream',
      cfRecordingPreparing: false,
      playbackUrl: vod,
      hlsUrl: vod,
      cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
      cfStreamLiveInputId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    { isLive: true, playbackMode: 'live', reconnecting: false }
  );
  assert.equal(merged.isLive, false);
  assert.equal(merged.playbackMode, 'recorded');
  assert.equal(merged.playbackUrl, vod);
});

test('ended event status beats stale REST isLive for Cloudflare', () => {
  const merged = mergeLivePriorityConfig(
    {
      status: 'ended',
      isLive: true,
      isPublishing: undefined,
      playbackMode: 'live',
      liveIngestProvider: 'cloudflare_stream',
      playbackUrl: 'https://customer-test.cloudflarestream.com/cccccccccccccccccccccccccccccccc/manifest/video.m3u8',
      hlsUrl: 'https://customer-test.cloudflarestream.com/cccccccccccccccccccccccccccccccc/manifest/video.m3u8',
      cfStreamLiveInputId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
    },
    { isLive: true, playbackMode: 'live' }
  );
  assert.equal(merged.isLive, false);
  assert.notEqual(merged.playbackMode, 'live');
});

