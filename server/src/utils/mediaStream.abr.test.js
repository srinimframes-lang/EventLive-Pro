import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHlsPlaybackUrl,
  buildOriginHlsPlaybackUrl,
  hlsPlaylistName,
  isAdaptiveStreamingEnabled,
  normalizePlaybackUrl,
} from './mediaStream.js';
import { rewriteViewerHlsUrl, setHlsCdnEnabled } from './hlsCdn.js';

test('adaptiveStreaming defaults ON', () => {
  assert.equal(isAdaptiveStreamingEnabled({}), true);
  assert.equal(isAdaptiveStreamingEnabled({ adaptiveStreaming: true }), true);
  assert.equal(isAdaptiveStreamingEnabled({ adaptiveStreaming: false }), false);
});

test('hlsPlaylistName switches master vs index', () => {
  assert.equal(hlsPlaylistName({}), 'master.m3u8');
  assert.equal(hlsPlaylistName({ adaptiveStreaming: false }), 'index.m3u8');
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
