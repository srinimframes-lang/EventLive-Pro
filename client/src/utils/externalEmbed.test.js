import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STREAMING_PROVIDER_OPTIONS,
  inferStreamingProvider,
  selectExternalEmbedPlayer,
  validateExternalEmbedForm,
} from './externalEmbed.js';

test('admin provider dropdown includes required labels', () => {
  assert.deepEqual(
    STREAMING_PROVIDER_OPTIONS.map((item) => item.label),
    ['Cloudflare Stream', 'Mux', 'External Server Embed', 'YouTube', 'Legacy MediaMTX'],
  );
});

test('inferStreamingProvider prefers stored field and leaves legacy events intact', () => {
  assert.equal(inferStreamingProvider({ streamingProvider: 'external_embed' }), 'external_embed');
  assert.equal(inferStreamingProvider({ liveIngestProvider: 'cloudflare_stream' }), 'cloudflare_stream');
  assert.equal(
    inferStreamingProvider({ liveIngestProvider: 'mediamtx', streamProvider: 'rtmp' }),
    'mediamtx',
  );
  assert.equal(inferStreamingProvider({ streamProvider: 'youtube' }), 'youtube');
});

test('selectExternalEmbedPlayer only renders for external_embed configs', () => {
  assert.equal(
    selectExternalEmbedPlayer({
      liveIngestProvider: 'cloudflare_stream',
      viewerPlayback: 'cloudflare_stream',
    }),
    null,
  );
  assert.equal(
    selectExternalEmbedPlayer({
      provider: 'youtube',
      viewerPlayback: 'youtube',
      youtubeVideoId: 'dQw4w9WgXcQ',
    }),
    null,
  );
  assert.deepEqual(
    selectExternalEmbedPlayer({
      streamingProvider: 'external_embed',
      viewerPlayback: 'external_embed',
      externalEmbedType: 'iframe',
      externalEmbedUrl: 'https://ok.example/e',
    }),
    { mode: 'iframe', type: 'iframe', url: 'https://ok.example/e' },
  );
  assert.deepEqual(
    selectExternalEmbedPlayer({
      streamingProvider: 'external_embed',
      viewerPlayback: 'external_embed',
      externalEmbedType: 'hls',
      externalHlsUrl: 'https://ok.example/live.m3u8',
    }),
    { mode: 'hls', type: 'hls', url: 'https://ok.example/live.m3u8' },
  );
});

test('validateExternalEmbedForm rejects javascript and http', () => {
  assert.match(
    validateExternalEmbedForm({
      externalEmbedType: 'iframe',
      externalEmbedUrl: 'javascript:alert(1)',
    }),
    /HTTPS embed URL/,
  );
  assert.match(
    validateExternalEmbedForm({
      externalEmbedType: 'iframe',
      externalEmbedUrl: 'http://insecure.example/e',
    }),
    /HTTPS embed URL/,
  );
  assert.equal(
    validateExternalEmbedForm({
      externalEmbedType: 'iframe',
      externalEmbedUrl: 'https://ok.example/e',
    }),
    '',
  );
});
