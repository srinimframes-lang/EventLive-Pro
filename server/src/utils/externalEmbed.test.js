import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExternalEmbedFields,
  extractIframeSrc,
  inferStreamingProvider,
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
