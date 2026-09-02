import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveServerPlaybackUrl,
  securePlaybackUrl,
  withCloudflareLiveDvr,
} from './streamPlayback.js';

const CF_HLS =
  'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
const MTX_HLS = 'https://stream.eventlivepro.com/live/aaaaaaaaaaaaaaaaaaaaaaaa/index.m3u8';

test('resolveServerPlaybackUrl appends dvrEnabled=true to Cloudflare manifests', () => {
  const url = resolveServerPlaybackUrl({
    playbackUrl: CF_HLS,
    eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(url, `${CF_HLS}?dvrEnabled=true`);
});

test('resolveServerPlaybackUrl accepts cloudflarestream.com hosts', () => {
  const hosted = 'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8';
  assert.equal(resolveServerPlaybackUrl({ hlsUrl: hosted }), `${hosted}?dvrEnabled=true`);
});

test('resolveServerPlaybackUrl preserves Cloudflare query params and does not duplicate dvrEnabled', () => {
  const withHint = resolveServerPlaybackUrl({
    playbackUrl: `${CF_HLS}?clientBandwidthHint=10`,
  });
  const parsed = new URL(withHint);
  assert.equal(`${parsed.origin}${parsed.pathname}`, CF_HLS);
  assert.equal(parsed.searchParams.get('clientBandwidthHint'), '10');
  assert.equal(parsed.searchParams.get('dvrEnabled'), 'true');
  assert.equal(parsed.searchParams.getAll('dvrEnabled').length, 1);

  const already = resolveServerPlaybackUrl({ playbackUrl: `${CF_HLS}?dvrEnabled=true` });
  assert.equal(already, `${CF_HLS}?dvrEnabled=true`);
  assert.equal(withCloudflareLiveDvr(`${CF_HLS}?dvrEnabled=true`), `${CF_HLS}?dvrEnabled=true`);
});

test('resolveServerPlaybackUrl still uses MediaMTX playlists for other events', () => {
  const url = resolveServerPlaybackUrl({
    playbackUrl: MTX_HLS,
    eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(url, MTX_HLS);
});

test('securePlaybackUrl does not rewrite Cloudflare HLS to MediaMTX', () => {
  assert.equal(securePlaybackUrl(CF_HLS), `${CF_HLS}?dvrEnabled=true`);
});
