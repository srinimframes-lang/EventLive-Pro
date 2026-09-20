import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExternalEmbedFields,
  canonicalizeExternalIframeSrc,
  extractIframeSrc,
  inferStreamingProvider,
  isYouTubeIframeSrc,
  resolveExternalEmbedPlayback,
  sanitizeHttpsUrl,
  sanitizeHlsUrl,
  sanitizeIframeHtml,
  validateExternalEmbedPayload,
} from './externalEmbed.js';

test('sanitizeHttpsUrl allows https only', () => {
  assert.equal(sanitizeHttpsUrl('https://cdn.example.com/live'), 'https://cdn.example.com/live');
  assert.equal(sanitizeHttpsUrl('http://cdn.example.com/live'), '');
  assert.equal(sanitizeHttpsUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeHttpsUrl('https://user:pass@cdn.example.com/live'), '');
});

test('sanitizeHlsUrl requires .m3u8', () => {
  assert.equal(
    sanitizeHlsUrl('https://cdn.example.com/live/index.m3u8'),
    'https://cdn.example.com/live/index.m3u8',
  );
  assert.equal(sanitizeHlsUrl('https://cdn.example.com/live/index.mp4'), '');
});

test('iframe HTML is reconstructed from src only', () => {
  assert.equal(extractIframeSrc('<script>alert(1)</script><iframe src="https://ok.example/e"></iframe>'), '');
  assert.equal(extractIframeSrc('<iframe src="https://ok.example/e" onload="steal()"></iframe>'), '');
  assert.equal(
    sanitizeIframeHtml('<iframe src="https://ok.example/e" width="640" allow="autoplay"></iframe>'),
    '<iframe src="https://ok.example/e"></iframe>',
  );
});

test('validateExternalEmbedPayload requires a playable HTTPS source', () => {
  assert.match(validateExternalEmbedPayload({ externalEmbedType: 'iframe' }), /HTTPS embed URL/);
  assert.match(
    validateExternalEmbedPayload({ externalEmbedType: 'hls', externalHlsUrl: 'https://x.test/a.mp4' }),
    /HLS/,
  );
  assert.equal(
    validateExternalEmbedPayload({
      externalEmbedType: 'iframe',
      externalEmbedUrl: 'https://ok.example/e',
    }),
    null,
  );
});

test('applyExternalEmbedFields stays independent of Cloudflare/MediaMTX', () => {
  const target = {
    streamProvider: 'rtmp',
    streamingDestination: 'server',
    liveIngestProvider: 'cloudflare_stream',
  };
  applyExternalEmbedFields(target, {
    externalEmbedType: 'iframe',
    externalEmbedUrl: 'https://ok.example/e',
  });
  assert.equal(target.streamingProvider, 'external_embed');
  assert.equal(target.streamProvider, 'none');
  assert.equal(target.streamingDestination, undefined);
  assert.equal(target.externalEmbedUrl, 'https://ok.example/e');
});

test('inferStreamingProvider does not rewrite legacy events without embed fields', () => {
  assert.equal(inferStreamingProvider({ liveIngestProvider: 'cloudflare_stream' }), 'cloudflare_stream');
  assert.equal(
    inferStreamingProvider({ liveIngestProvider: 'mediamtx', streamProvider: 'rtmp' }),
    'mediamtx',
  );
  assert.equal(inferStreamingProvider({ streamProvider: 'youtube' }), 'youtube');
  assert.equal(inferStreamingProvider({}), '');
});

test('resolveExternalEmbedPlayback picks iframe or HLS', () => {
  const iframe = resolveExternalEmbedPlayback({
    externalEmbedType: 'iframe',
    externalEmbedHtml: '<iframe src="https://ok.example/player"></iframe>',
  });
  assert.deepEqual(iframe, { type: 'iframe', url: 'https://ok.example/player', valid: true });

  const hls = resolveExternalEmbedPlayback({
    externalEmbedType: 'hls',
    externalHlsUrl: 'https://ok.example/live.m3u8',
  });
  assert.deepEqual(hls, { type: 'hls', url: 'https://ok.example/live.m3u8', valid: true });
});

const YT_ID = 'dQw4w9WgXcQ';
const YT_EMBED = `https://www.youtube.com/embed/${YT_ID}`;
const YT_IFRAME = `<iframe width="560" height="315" src="${YT_EMBED}" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;

test('YouTube embed URL and iframe HTML are accepted for External Server Embed', () => {
  assert.equal(extractIframeSrc(YT_IFRAME), YT_EMBED);
  assert.equal(canonicalizeExternalIframeSrc(YT_EMBED), YT_EMBED);
  assert.equal(canonicalizeExternalIframeSrc(`https://youtu.be/${YT_ID}`), YT_EMBED);
  assert.equal(isYouTubeIframeSrc(YT_EMBED), true);

  const fromUrl = resolveExternalEmbedPlayback({
    externalEmbedType: 'iframe',
    externalEmbedUrl: YT_EMBED,
  });
  assert.deepEqual(fromUrl, { type: 'iframe', url: YT_EMBED, valid: true });

  const fromHtml = resolveExternalEmbedPlayback({
    externalEmbedType: 'iframe',
    externalEmbedHtml: YT_IFRAME,
  });
  assert.deepEqual(fromHtml, { type: 'iframe', url: YT_EMBED, valid: true });

  const target = { streamProvider: 'none' };
  applyExternalEmbedFields(target, {
    externalEmbedType: 'iframe',
    externalEmbedHtml: YT_IFRAME,
  });
  assert.equal(target.streamingProvider, 'external_embed');
  assert.equal(target.externalEmbedUrl, YT_EMBED);
  assert.equal(target.externalEmbedHtml, `<iframe src="${YT_EMBED}"></iframe>`);
  assert.equal(validateExternalEmbedPayload({
    externalEmbedType: 'iframe',
    externalEmbedUrl: YT_EMBED,
  }), null);
});
