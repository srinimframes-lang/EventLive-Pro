import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyYoutubeForwardFields,
  buildYoutubeForwardTarget,
  normalizeStreamingDestination,
  normalizeYoutubeRtmpUrl,
  normalizeYoutubeStreamKey,
  sanitizeStreamingSecrets,
} from './youtubeForward.js';

test('normalizeStreamingDestination accepts aliases', () => {
  assert.equal(normalizeStreamingDestination('server'), 'server');
  assert.equal(normalizeStreamingDestination('YouTube Only'), 'youtube');
  assert.equal(normalizeStreamingDestination('youtube'), 'youtube');
  assert.equal(normalizeStreamingDestination('server_youtube'), 'server_youtube');
  assert.equal(normalizeStreamingDestination('server+youtube'), 'server_youtube');
  assert.equal(normalizeStreamingDestination('youtube_server'), 'youtube_server');
  assert.equal(normalizeStreamingDestination('youtube+server'), 'youtube_server');
});

test('normalizeYoutubeRtmpUrl accepts rtmp/rtmps', () => {
  assert.equal(
    normalizeYoutubeRtmpUrl('rtmp://a.rtmp.youtube.com/live2'),
    'rtmp://a.rtmp.youtube.com/live2'
  );
  assert.equal(normalizeYoutubeRtmpUrl('https://youtube.com'), null);
  assert.equal(normalizeYoutubeRtmpUrl(''), '');
});

test('normalizeYoutubeStreamKey enforces charset and length', () => {
  assert.equal(normalizeYoutubeStreamKey('abcd-efgh-ijkl'), 'abcd-efgh-ijkl');
  assert.equal(normalizeYoutubeStreamKey('short'), null);
  assert.equal(normalizeYoutubeStreamKey('bad key!'), null);
});

test('buildYoutubeForwardTarget accepts longer stored keys', () => {
  const longKey = `yt-${'a'.repeat(200)}`;
  assert.ok(buildYoutubeForwardTarget('rtmp://a.rtmp.youtube.com/live2', longKey)?.includes(longKey));
});

test('buildYoutubeForwardTarget joins url and key', () => {
  assert.equal(
    buildYoutubeForwardTarget('rtmp://a.rtmp.youtube.com/live2', 'xxxx-xxxx-xxxx'),
    'rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx'
  );
});

test('applyYoutubeForwardFields requires key when forward enabled', () => {
  const target = {};
  const err = applyYoutubeForwardFields(
    target,
    {
      streamingDestination: 'server_youtube',
      youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      youtubeForwardEnabled: true,
    },
    { isCreate: true }
  );
  assert.match(err, /Stream Key/i);
});

test('applyYoutubeForwardFields accepts valid simultaneous config', () => {
  const target = {};
  const err = applyYoutubeForwardFields(
    target,
    {
      streamingDestination: 'server_youtube',
      youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      youtubeStreamKey: 'xxxx-yyyy-zzzz',
      youtubeForwardEnabled: true,
    },
    { isCreate: true }
  );
  assert.equal(err, null);
  assert.equal(target.streamingDestination, 'server_youtube');
  assert.equal(target.youtubeForwardEnabled, true);
  assert.equal(target.youtubeStreamKey, 'xxxx-yyyy-zzzz');
});

test('applyYoutubeForwardFields accepts youtube_server destination', () => {
  const target = {};
  const err = applyYoutubeForwardFields(
    target,
    {
      streamingDestination: 'youtube_server',
      youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      youtubeStreamKey: 'aaaa-bbbb-cccc-dddd',
      youtubeForwardEnabled: true,
    },
    { isCreate: true }
  );
  assert.equal(err, null);
  assert.equal(target.streamingDestination, 'youtube_server');
  assert.equal(target.youtubeForwardEnabled, true);
});

test('sanitizeStreamingSecrets never returns the key', () => {
  const data = sanitizeStreamingSecrets(
    {
      youtubeStreamKey: 'secret',
      facebookStreamKey: 'fb-secret',
      rtmpStreamKey: 'id',
      title: 'T',
    },
    { hasYoutubeStreamKey: true, hasFacebookStreamKey: true }
  );
  assert.equal(data.youtubeStreamKey, undefined);
  assert.equal(data.facebookStreamKey, undefined);
  assert.equal(data.rtmpStreamKey, undefined);
  assert.equal(data.youtubeStreamKeySet, true);
  assert.equal(data.facebookStreamKeySet, true);
  assert.equal(data.title, 'T');
});
