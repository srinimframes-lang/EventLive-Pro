import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHlsPlaybackUrl,
  buildOriginHlsPlaybackUrl,
  buildRtmpCredentials,
  deriveHlsPlaybackUrl,
  hlsPlaylistName,
  isAdaptiveStreamingEnabled,
  isCloudflareStreamLive,
  normalizePlaybackUrl,
  syncServerStreamFields,
} from './mediaStream.js';
import { rewriteViewerHlsUrl, setHlsCdnEnabled } from './hlsCdn.js';

test('adaptiveStreaming defaults OFF (Standard)', () => {
  assert.equal(isAdaptiveStreamingEnabled({}), false);
  assert.equal(isAdaptiveStreamingEnabled({ adaptiveStreaming: false }), false);
  assert.equal(isAdaptiveStreamingEnabled({ adaptiveStreaming: true }), true);
});

test('hlsPlaylistName switches master vs index', () => {
  assert.equal(hlsPlaylistName({}), 'index.m3u8');
  assert.equal(hlsPlaylistName({ adaptiveStreaming: false }), 'index.m3u8');
  assert.equal(hlsPlaylistName({ adaptiveStreaming: true }), 'master.m3u8');
});

test('buildHlsPlaybackUrl uses master when adaptive ON', () => {
  const url = buildHlsPlaybackUrl('abc123abc123abc123abc123', { adaptiveStreaming: true });
  assert.match(url, /\/live\/abc123abc123abc123abc123\/master\.m3u8$/);
});

test('buildHlsPlaybackUrl uses index when adaptive OFF', () => {
  const url = buildHlsPlaybackUrl('abc123abc123abc123abc123', { adaptiveStreaming: false });
  assert.match(url, /\/live\/abc123abc123abc123abc123\/index\.m3u8$/);
});

test('buildOriginHlsPlaybackUrl respects adaptive flag', () => {
  assert.match(
    buildOriginHlsPlaybackUrl('aaaaaaaaaaaaaaaaaaaaaaaa', { adaptiveStreaming: true }),
    /master\.m3u8$/
  );
  assert.match(
    buildOriginHlsPlaybackUrl('aaaaaaaaaaaaaaaaaaaaaaaa', { adaptiveStreaming: false }),
    /index\.m3u8$/
  );
});

test('CDN rewrite accepts master and index playlists', () => {
  setHlsCdnEnabled(true);
  const master = rewriteViewerHlsUrl(
    'https://stream.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/master.m3u8'
  );
  assert.match(master, /^https:\/\/cdn\.eventlivepro\.com\/live\/.+\/master\.m3u8$/);
  const index = rewriteViewerHlsUrl(
    'https://stream.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/index.m3u8'
  );
  assert.match(index, /^https:\/\/cdn\.eventlivepro\.com\/live\/.+\/index\.m3u8$/);
  setHlsCdnEnabled(false);
  const back = normalizePlaybackUrl(
    'https://cdn.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/master.m3u8'
  );
  assert.match(back, /^https:\/\/stream\.eventlivepro\.com\/live\/.+\/master\.m3u8$/);
});

const CF_HLS =
  'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
const CF_RTMPS = 'rtmps://live.cloudflare.com:443/live';
const EVENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

test('isCloudflareStreamLive is opt-in only', () => {
  assert.equal(isCloudflareStreamLive({}), false);
  assert.equal(isCloudflareStreamLive({ liveIngestProvider: 'mediamtx' }), false);
  assert.equal(isCloudflareStreamLive({ liveIngestProvider: 'cloudflare_stream' }), true);
});

test('deriveHlsPlaybackUrl appends dvrEnabled=true to Cloudflare HLS', () => {
  const url = deriveHlsPlaybackUrl({
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamHlsUrl: CF_HLS,
    rtmpStreamKey: EVENT_ID,
  });
  assert.equal(url, `${CF_HLS}?dvrEnabled=true`);
});

test('deriveHlsPlaybackUrl preserves existing Cloudflare HLS query params', () => {
  const url = deriveHlsPlaybackUrl({
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamHlsUrl: `${CF_HLS}?clientBandwidthHint=10`,
  });
  const parsed = new URL(url);
  assert.equal(`${parsed.origin}${parsed.pathname}`, CF_HLS);
  assert.equal(parsed.searchParams.get('clientBandwidthHint'), '10');
  assert.equal(parsed.searchParams.get('dvrEnabled'), 'true');
  assert.equal(parsed.searchParams.getAll('dvrEnabled').length, 1);
});

test('deriveHlsPlaybackUrl does not duplicate dvrEnabled on Cloudflare HLS', () => {
  const url = deriveHlsPlaybackUrl({
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamHlsUrl: `${CF_HLS}?dvrEnabled=true`,
  });
  assert.equal(url, `${CF_HLS}?dvrEnabled=true`);
});

test('deriveHlsPlaybackUrl still rebuilds MediaMTX URLs for other events', () => {
  const url = deriveHlsPlaybackUrl({
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    liveIngestProvider: 'mediamtx',
    rtmpStreamKey: EVENT_ID,
    cfStreamHlsUrl: CF_HLS,
  });
  assert.match(url, /\/live\/aaaaaaaaaaaaaaaaaaaaaaaa\/index\.m3u8$/);
  assert.equal(url.includes('cloudflarestream.com'), false);
  assert.equal(url.includes('dvrEnabled'), false);
});

test('buildRtmpCredentials uses Cloudflare RTMPS for opted-in events', () => {
  const creds = buildRtmpCredentials({
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamRtmpsUrl: `${CF_RTMPS}/`,
    cfStreamRtmpsKey: 'cf-test-key',
    cfStreamHlsUrl: CF_HLS,
  });
  assert.equal(creds.ingestUrl, CF_RTMPS);
  assert.equal(creds.streamKey, 'cf-test-key');
  assert.equal(creds.playbackUrl, CF_HLS);
  assert.equal(creds.mediamtxPath, '');
});

test('buildRtmpCredentials stays on MediaMTX when provider is missing', () => {
  const creds = buildRtmpCredentials({
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    rtmpStreamKey: EVENT_ID,
  });
  assert.match(creds.ingestUrl, /stream\.eventlivepro\.com/);
  assert.equal(creds.streamKey, EVENT_ID);
  assert.match(creds.playbackUrl, /\/live\/aaaaaaaaaaaaaaaaaaaaaaaa\/index\.m3u8$/);
  assert.equal(creds.mediamtxPath, `live/${EVENT_ID}`);
});

test('syncServerStreamFields does not overwrite Cloudflare events', () => {
  const event = {
    _id: EVENT_ID,
    streamProvider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamHlsUrl: CF_HLS,
    cfStreamRtmpsUrl: CF_RTMPS,
    cfStreamRtmpsKey: 'cf-test-key',
    hlsUrl: CF_HLS,
    rtmpPublishUrl: `${CF_RTMPS}/cf-test-key`,
  };
  assert.equal(syncServerStreamFields(event), null);
  assert.equal(event.cfStreamHlsUrl, CF_HLS);
  assert.equal(event.hlsUrl, CF_HLS);
});
