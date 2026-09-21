import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMuxPlayerIframeUrl,
  isMuxPlaybackConfig,
  muxHlsUrl,
  muxPlayerMountKey,
  selectMuxPlayer,
} from './muxPlayer.js';

test('isMuxPlaybackConfig is independent of leftover Cloudflare fields', () => {
  assert.equal(isMuxPlaybackConfig(null), false);
  assert.equal(
    isMuxPlaybackConfig({
      liveIngestProvider: 'cloudflare_stream',
      viewerPlayback: 'cloudflare_stream',
    }),
    false,
  );
  assert.equal(
    isMuxPlaybackConfig({
      streamingProvider: 'mux',
      viewerPlayback: 'mux',
      liveIngestProvider: 'cloudflare_stream',
      cfStreamLiveInputId: 'leftover',
    }),
    true,
  );
});

test('buildMuxPlayerIframeUrl uses player.mux.com and never Cloudflare', () => {
  const live = buildMuxPlayerIframeUrl({ playbackId: 'abcPlayback', mode: 'live' });
  assert.match(live, /^https:\/\/player\.mux\.com\/abcPlayback\?/);
  assert.match(live, /stream-type=live/);
  assert.equal(live.includes('cloudflare'), false);
  const vod = buildMuxPlayerIframeUrl({ playbackId: 'vodPlayback', mode: 'recorded' });
  assert.match(vod, /stream-type=on-demand/);
  assert.equal(buildMuxPlayerIframeUrl({ playbackId: '' }), '');
});

test('selectMuxPlayer uses live playback while publishing and asset playback after', () => {
  const live = selectMuxPlayer({
    streamingProvider: 'mux',
    viewerPlayback: 'mux',
    isPublishing: true,
    isLive: true,
    playbackMode: 'live',
    muxPlaybackId: 'livePid',
    muxAssetPlaybackId: 'vodPid',
    cfStreamHlsUrl: 'https://customer.cloudflarestream.com/x/manifest/video.m3u8',
  });
  assert.equal(live.mode, 'live');
  assert.equal(live.playbackId, 'livePid');
  assert.match(live.iframeUrl, /player\.mux\.com\/livePid/);
  assert.equal(live.iframeUrl.includes('cloudflare'), false);

  const vod = selectMuxPlayer({
    streamingProvider: 'mux',
    viewerPlayback: 'mux',
    isPublishing: false,
    isLive: false,
    playbackMode: 'recorded',
    muxPlaybackId: 'livePid',
    muxAssetPlaybackId: 'vodPid',
  });
  assert.equal(vod.mode, 'recorded');
  assert.equal(vod.playbackId, 'vodPid');
  assert.match(vod.iframeUrl, /player\.mux\.com\/vodPid/);
});

test('selectMuxPlayer waiting / preparing / ended states', () => {
  assert.equal(selectMuxPlayer({ provider: 'rtmp' }), null);
  assert.equal(
    selectMuxPlayer({
      streamingProvider: 'mux',
      muxRecordingPreparing: true,
      isLive: false,
      isPublishing: false,
    }).mode,
    'recording-preparing',
  );
  assert.equal(
    selectMuxPlayer({
      streamingProvider: 'mux',
      status: 'ended',
      isLive: false,
      isPublishing: false,
    }).mode,
    'ended',
  );
  assert.equal(
    selectMuxPlayer({
      streamingProvider: 'mux',
      status: 'published',
      muxPlaybackId: 'livePid',
      isLive: false,
      isPublishing: false,
    }).mode,
    'waiting-for-live',
  );
});

test('mux HLS and mount keys stay on Mux hosts', () => {
  assert.equal(muxHlsUrl('pid'), 'https://stream.mux.com/pid.m3u8');
  assert.equal(muxPlayerMountKey({ mode: 'live', playbackId: 'p', eventId: 'e' }), 'mux-iframe-live-e-p');
});
