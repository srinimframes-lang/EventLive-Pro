import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STREAMING_PROVIDER_OPTIONS,
  canonicalizeExternalIframeSrc,
  extractIframeSrc,
  inferStreamingProvider,
  isYouTubeIframeSrc,
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

const YT_ID = 'dQw4w9WgXcQ';
const YT_EMBED = `https://www.youtube.com/embed/${YT_ID}`;
const YT_IFRAME = `<iframe width="560" height="315" src="${YT_EMBED}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;

test('YouTube embed URL and iframe HTML resolve to youtube.com/embed', () => {
  assert.equal(extractIframeSrc(YT_IFRAME), YT_EMBED);
  assert.equal(canonicalizeExternalIframeSrc(YT_EMBED), YT_EMBED);
  assert.equal(
    canonicalizeExternalIframeSrc(`https://www.youtube.com/watch?v=${YT_ID}`),
    YT_EMBED,
  );
  assert.deepEqual(
    selectExternalEmbedPlayer({
      streamingProvider: 'external_embed',
      viewerPlayback: 'external_embed',
      externalEmbedType: 'iframe',
      externalEmbedUrl: YT_EMBED,
    }),
    { mode: 'iframe', type: 'iframe', url: YT_EMBED },
  );
  assert.deepEqual(
    selectExternalEmbedPlayer({
      streamingProvider: 'external_embed',
      viewerPlayback: 'external_embed',
      externalEmbedType: 'iframe',
      externalEmbedHtml: YT_IFRAME,
    }),
    { mode: 'iframe', type: 'iframe', url: YT_EMBED },
  );
  assert.equal(isYouTubeIframeSrc(YT_EMBED), true);
  assert.equal(isYouTubeIframeSrc('https://ok.example/e'), false);
  assert.equal(
    validateExternalEmbedForm({
      externalEmbedType: 'iframe',
      externalEmbedHtml: YT_IFRAME,
    }),
    '',
  );
});
