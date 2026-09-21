import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCloudflareStreamIframeUrl,
  cloudflareStreamOriginFromUrl,
  cloudflareStreamPlayerMountKey,
  isYoutubeOnlyWebsitePlayback,
  selectCloudflareStreamPlayer,
  selectWatchPlayerSurface,
} from './cloudflareStreamPlayer.js';

const ORIGIN_HLS =
  'https://customer-abhs0ar9htahlgra.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
const LIVE_INPUT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VIDEO_UID = 'cccccccccccccccccccccccccccccccc';

function liveConfig(overrides = {}) {
  return {
    liveIngestProvider: 'cloudflare_stream',
    isPublishing: true,
    isLive: true,
    playbackMode: 'live',
    cfStreamLiveInputId: LIVE_INPUT,
    cfStreamVideoUid: VIDEO_UID,
    cfStreamHlsUrl: ORIGIN_HLS,
    poster: '',
    ...overrides,
  };
}

function recordedConfig(overrides = {}) {
  return {
    liveIngestProvider: 'cloudflare_stream',
    isPublishing: false,
    isLive: false,
    playbackMode: 'recorded',
    cfStreamLiveInputId: LIVE_INPUT,
    cfStreamVideoUid: VIDEO_UID,
    cfStreamHlsUrl: ORIGIN_HLS,
    poster: '',
    ...overrides,
  };
}

test('iframe origin comes from the stored Cloudflare HLS host', () => {
  assert.equal(
    cloudflareStreamOriginFromUrl(ORIGIN_HLS),
    'https://customer-abhs0ar9htahlgra.cloudflarestream.com',
  );
  assert.equal(cloudflareStreamOriginFromUrl('https://example.com/x'), '');
});

test('live iframe uses Live Input UID, not the VOD UID', () => {
  const selected = selectCloudflareStreamPlayer({ config: liveConfig() });
  assert.equal(selected.mode, 'live');
  assert.equal(selected.uid, LIVE_INPUT);
  assert.equal(selected.videoUid, '');
  assert.match(selected.iframeUrl, /\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\/iframe/);
  assert.equal(selected.iframeUrl.includes(VIDEO_UID), false);
  assert.equal(selected.showLiveBadge, true);
  const url = new URL(selected.iframeUrl);
  assert.equal(url.searchParams.get('autoplay'), 'true');
});

test('recorded iframe uses Video UID, starts at 0, and does not loop', () => {
  const selected = selectCloudflareStreamPlayer({ config: recordedConfig() });
  assert.equal(selected.mode, 'recorded');
  assert.equal(selected.uid, VIDEO_UID);
  assert.equal(selected.uid === LIVE_INPUT, false);
  assert.match(selected.iframeUrl, /\/cccccccccccccccccccccccccccccccc\/iframe/);
  assert.equal(selected.iframeUrl.includes(LIVE_INPUT), false);
  const url = new URL(selected.iframeUrl);
  assert.equal(url.searchParams.get('loop'), 'false');
  assert.equal(url.searchParams.get('startTime'), '0');
  assert.equal(selected.showWaitingForLive, false);
});

test('VOD EOS unmounts replay and shows Waiting for live', () => {
  const selected = selectCloudflareStreamPlayer({
    config: recordedConfig(),
    recordedVodEnded: true,
  });
  assert.equal(selected.mode, 'waiting-for-live');
  assert.equal(selected.iframeUrl, '');
  assert.equal(selected.showWaitingForLive, true);
  assert.equal(selected.isLive, false);
});

test('isLive with an old Video UID still uses the Live Input iframe', () => {
  const selected = selectCloudflareStreamPlayer({
    config: liveConfig({
      isPublishing: undefined,
      playbackMode: 'live',
      cfStreamVideoUid: VIDEO_UID,
    }),
  });
  assert.equal(selected.mode, 'live');
  assert.equal(selected.uid, LIVE_INPUT);
  assert.equal(selected.iframeUrl.includes(VIDEO_UID), false);
});

test('isPublishing false uses Video UID even if isLive is still true', () => {
  const selected = selectCloudflareStreamPlayer({
    config: recordedConfig({ isLive: true }),
  });
  assert.equal(selected.mode, 'recorded');
  assert.equal(selected.uid, VIDEO_UID);
  assert.equal(selected.iframeUrl.includes(LIVE_INPUT), false);
});

test('next OBS publish switches back to Live Input UID', () => {
  const afterVod = selectCloudflareStreamPlayer({
    config: recordedConfig(),
    recordedVodEnded: true,
  });
  assert.equal(afterVod.mode, 'waiting-for-live');

  const nextLive = selectCloudflareStreamPlayer({
    config: liveConfig({ cfStreamVideoUid: VIDEO_UID }),
    recordedVodEnded: true,
  });
  assert.equal(nextLive.mode, 'live');
  assert.equal(nextLive.uid, LIVE_INPUT);
  assert.equal(nextLive.iframeUrl.includes(VIDEO_UID), false);
  assert.notEqual(
    cloudflareStreamPlayerMountKey({ mode: nextLive.mode, uid: nextLive.uid, eventId: 'e1' }),
    cloudflareStreamPlayerMountKey({ mode: 'recorded', uid: VIDEO_UID, eventId: 'e1' }),
  );
});

test('offline without Video UID stays preparing, never live DVR', () => {
  const selected = selectCloudflareStreamPlayer({
    config: recordedConfig({
      cfStreamVideoUid: '',
      playbackMode: 'offline',
    }),
  });
  assert.equal(selected.mode, 'recording-preparing');
  assert.equal(selected.iframeUrl, '');
  assert.equal(selected.showWaitingForLive, false);
});

test('YouTube + Server leftover Cloudflare recording state does not take the watch surface', () => {
  const config = liveConfig({
    streamingDestination: 'youtube_server',
    viewerPlayback: 'youtube',
    provider: 'rtmp',
    isPublishing: false,
    isLive: false,
    playbackMode: 'offline',
    cfRecordingPreparing: true,
    cfStreamVideoUid: '',
    youtubeVideoId: 'dQw4w9wgGcQ',
  });
  assert.equal(isYoutubeOnlyWebsitePlayback(config), true);
  assert.equal(selectCloudflareStreamPlayer({ config }), null);
  assert.equal(selectWatchPlayerSurface(config).surface, 'other');
});

test('Server + YouTube Cloudflare events still use the Stream iframe for website playback', () => {
  const selected = selectWatchPlayerSurface(
    liveConfig({
      streamingDestination: 'server_youtube',
      provider: 'rtmp',
    }),
  );
  assert.equal(selected.surface, 'cloudflare-iframe');
  assert.equal(selected.player.mode, 'live');
  assert.equal(selected.player.uid, LIVE_INPUT);
});

test('cfStreamPlayerUrl from GET /stream is enough to build the live iframe', () => {
  const selected = selectCloudflareStreamPlayer({
    config: {
      liveIngestProvider: 'cloudflare_stream',
      isPublishing: true,
      cfStreamLiveInputId: LIVE_INPUT,
      cfStreamVideoUid: VIDEO_UID,
      cfStreamPlayerUrl: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${LIVE_INPUT}/iframe`,
      playbackUrl: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${LIVE_INPUT}/iframe`,
      playbackMode: 'live',
    },
  });
  assert.equal(selected.mode, 'live');
  assert.match(selected.iframeUrl, /\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\/iframe/);
  assert.equal(selected.iframeUrl.includes(VIDEO_UID), false);
});

test('MediaMTX configs never select CloudflareStreamPlayer', () => {
  const selected = selectWatchPlayerSurface({
    provider: 'rtmp',
    liveIngestProvider: 'mediamtx',
    isPublishing: true,
    playbackUrl: 'https://stream.eventlivepro.com/live/abc/index.m3u8',
  });
  assert.equal(selected.surface, 'other');
  assert.equal(selected.player, null);
});

test('Live Input UID is never used as the recorded iframe UID', () => {
  const selected = selectCloudflareStreamPlayer({
    config: recordedConfig({
      cfStreamVideoUid: LIVE_INPUT,
    }),
  });
  assert.equal(selected.mode, 'recording-preparing');
  assert.equal(buildCloudflareStreamIframeUrl({ originUrl: ORIGIN_HLS, uid: '', mode: 'recorded' }), '');
});

test('external embed leftover Cloudflare fields do not take the watch surface', () => {
  const config = liveConfig({
    streamingProvider: 'external_embed',
    viewerPlayback: 'external_embed',
  });
  assert.equal(selectCloudflareStreamPlayer({ config }), null);
  assert.equal(selectWatchPlayerSurface(config).surface, 'other');
});

test('YouTube-only leftover Cloudflare recording state does not take the watch surface', () => {
  const config = {
    provider: 'youtube',
    streamingProvider: 'youtube',
    viewerPlayback: 'cloudflare_stream',
    liveIngestProvider: 'cloudflare_stream',
    streamingDestination: 'youtube',
    isLive: false,
    isPublishing: undefined,
    playbackMode: 'offline',
    status: 'published',
    cfRecordingPreparing: true,
    cfStreamLiveInputId: LIVE_INPUT,
    cfStreamVideoUid: '',
    youtubeVideoId: 'dQw4w9WgXcQ',
  };
  assert.equal(isYoutubeOnlyWebsitePlayback(config), true);
  assert.equal(selectCloudflareStreamPlayer({ config }), null);
  assert.equal(selectWatchPlayerSurface(config).surface, 'other');
  assert.equal(selectWatchPlayerSurface(config).player, null);
});

test('External Server Embed YouTube iframe leftover CF does not show recording-preparing', () => {
  const config = liveConfig({
    streamingProvider: 'external_embed',
    viewerPlayback: 'external_embed',
    isPublishing: false,
    isLive: false,
    playbackMode: 'offline',
    cfRecordingPreparing: true,
    cfStreamVideoUid: '',
    externalEmbedType: 'iframe',
    externalEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  });
  assert.equal(selectCloudflareStreamPlayer({ config }), null);
  assert.equal(selectWatchPlayerSurface(config).surface, 'other');
});
