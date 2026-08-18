import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStreamTypeSelection,
  normalizeStreamType,
  usesServerIngest,
  usesYoutubeForward,
  validateOnlineStreamPayload,
} from './streamType.js';

test('four destinations normalize correctly', () => {
  assert.equal(normalizeStreamType({ streamType: 'server' }), 'server');
  assert.equal(normalizeStreamType({ streamType: 'youtube' }), 'youtube');
  assert.equal(normalizeStreamType({ streamType: 'server_youtube' }), 'server_youtube');
  assert.equal(normalizeStreamType({ streamType: 'youtube_server' }), 'youtube_server');
});

test('usesServerIngest / usesYoutubeForward helpers', () => {
  assert.equal(usesServerIngest('server'), true);
  assert.equal(usesServerIngest('youtube'), false);
  assert.equal(usesServerIngest('server_youtube'), true);
  assert.equal(usesServerIngest('youtube_server'), true);
  assert.equal(usesYoutubeForward('server'), false);
  assert.equal(usesYoutubeForward('youtube'), false);
  assert.equal(usesYoutubeForward('server_youtube'), true);
  assert.equal(usesYoutubeForward('youtube_server'), true);
});

test('youtube_server requires embed URL and keeps rtmp provider', () => {
  const payload = { isOnline: true, youtubeVideoId: '', streamUrl: '' };
  assert.match(
    validateOnlineStreamPayload(payload, 'youtube_server'),
    /YouTube Live \/ embed URL/i
  );

  const ok = {
    isOnline: true,
    youtubeVideoId: 'dQw4w9WgXcQ',
    streamUrl: 'https://youtu.be/dQw4w9WgXcQ',
  };
  assert.equal(validateOnlineStreamPayload(ok, 'youtube_server'), null);

  applyStreamTypeSelection(ok, 'youtube_server', { isCreate: true });
  assert.equal(ok.streamProvider, 'rtmp');
  assert.equal(ok.streamingDestination, 'youtube_server');
  assert.equal(ok.youtubeForwardEnabled, true);
  assert.equal(ok.youtubeVideoId, 'dQw4w9WgXcQ');
});

test('youtube URL is not required when OAuth auto-create is allowed', () => {
  const payload = { isOnline: true, youtubeVideoId: '', streamUrl: '' };
  assert.equal(
    validateOnlineStreamPayload(payload, 'youtube', { allowMissingYoutubeUrl: true }),
    null
  );
  assert.match(
    validateOnlineStreamPayload(payload, 'youtube'),
    /YouTube Live URL is required/i
  );
});

test('existing modes unchanged', () => {
  const server = {};
  applyStreamTypeSelection(server, 'server', { isCreate: true });
  assert.equal(server.streamProvider, 'rtmp');
  assert.equal(server.streamingDestination, 'server');
  assert.equal(server.youtubeForwardEnabled, false);

  const yt = { youtubeVideoId: 'abc123xyz01', streamUrl: '' };
  applyStreamTypeSelection(yt, 'youtube', { isCreate: true });
  assert.equal(yt.streamProvider, 'youtube');
  assert.equal(yt.streamingDestination, 'youtube');

  const both = {};
  applyStreamTypeSelection(both, 'server_youtube', { isCreate: true });
  assert.equal(both.streamProvider, 'rtmp');
  assert.equal(both.streamingDestination, 'server_youtube');
  assert.equal(both.youtubeForwardEnabled, true);
});
