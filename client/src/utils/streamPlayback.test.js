import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveServerPlaybackUrl, securePlaybackUrl } from './streamPlayback.js';

const CF_HLS =
  'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
const MTX_HLS = 'https://stream.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/index.m3u8';

test('resolveServerPlaybackUrl returns Cloudflare manifest URLs unchanged', () => {
  const url = resolveServerPlaybackUrl({
    playbackUrl: CF_HLS,
    eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(url, CF_HLS);
});

test('resolveServerPlaybackUrl accepts cloudflarestream.com hosts', () => {
  const hosted = 'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
  assert.equal(resolveServerPlaybackUrl({ hlsUrl: hosted }), hosted);
});

test('resolveServerPlaybackUrl still uses MediaMTX playlists for other events', () => {
  const url = resolveServerPlaybackUrl({
    playbackUrl: MTX_HLS,
    eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(url, MTX_HLS);
});

test('securePlaybackUrl does not rewrite Cloudflare HLS to MediaMTX', () => {
  assert.equal(securePlaybackUrl(CF_HLS), CF_HLS);
});
