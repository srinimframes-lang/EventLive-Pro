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
  assert.equal(normalizeStreamingDestination('YouTube Only'), null);
  assert.equal(normalizeStreamingDestination('youtube'), 'youtube');
  assert.equal(normalizeStreamingDestination('server_youtube'), 'server_youtube');
  assert.equal(normalizeStreamingDestination('server+youtube'), 'server_youtube');
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

test('sanitizeStreamingSecrets never returns the key', () => {
  const data = sanitizeStreamingSecrets(
    { youtubeStreamKey: 'secret', rtmpStreamKey: 'id', title: 'T' },
    { hasYoutubeStreamKey: true }
  );
  assert.equal(data.youtubeStreamKey, undefined);
  assert.equal(data.rtmpStreamKey, undefined);
  assert.equal(data.youtubeStreamKeySet, true);
  assert.equal(data.title, 'T');
});
