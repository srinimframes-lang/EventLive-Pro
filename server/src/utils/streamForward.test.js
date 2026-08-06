import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FACEBOOK_RTMP,
  applyFacebookForwardFields,
  buildForwardTarget,
  listEnabledForwardTargets,
  normalizeForwardRtmpUrl,
  normalizeForwardStreamKey,
  sanitizeForwardSecrets,
} from './streamForward.js';
import { sanitizeStreamingSecrets } from './youtubeForward.js';

test('normalizeForwardRtmpUrl accepts Facebook rtmps', () => {
  assert.equal(
    normalizeForwardRtmpUrl('rtmps://live-api-s.facebook.com:443/rtmp'),
    'rtmps://live-api-s.facebook.com:443/rtmp'
  );
  assert.equal(normalizeForwardRtmpUrl('https://facebook.com'), null);
});

test('normalizeForwardStreamKey accepts Facebook-style keys', () => {
  assert.equal(normalizeForwardStreamKey('FBKEY-1234567890'), 'FBKEY-1234567890');
  assert.equal(normalizeForwardStreamKey('short'), null);
});

test('buildForwardTarget joins Facebook URL and key', () => {
  assert.equal(
    buildForwardTarget(DEFAULT_FACEBOOK_RTMP, 'FBKEY-1234567890'),
    `${DEFAULT_FACEBOOK_RTMP}/FBKEY-1234567890`
  );
});

test('applyFacebookForwardFields requires key when enabled', () => {
  const target = { streamingDestination: 'server', streamProvider: 'rtmp' };
  const err = applyFacebookForwardFields(
    target,
    {
      facebookForwardEnabled: true,
      facebookRtmpUrl: DEFAULT_FACEBOOK_RTMP,
    },
    { isCreate: true }
  );
  assert.match(err, /Stream Key/i);
});

test('applyFacebookForwardFields rejects pure YouTube destination', () => {
  const target = { streamingDestination: 'youtube', streamProvider: 'youtube' };
  const err = applyFacebookForwardFields(
    target,
    {
      facebookForwardEnabled: true,
      facebookRtmpUrl: DEFAULT_FACEBOOK_RTMP,
      facebookStreamKey: 'FBKEY-1234567890',
    },
    { isCreate: true }
  );
  assert.match(err, /Server ingest/i);
});

test('applyFacebookForwardFields accepts server + facebook', () => {
  const target = { streamingDestination: 'server', streamProvider: 'rtmp' };
  const err = applyFacebookForwardFields(
    target,
    {
      facebookForwardEnabled: true,
      facebookRtmpUrl: DEFAULT_FACEBOOK_RTMP,
      facebookStreamKey: 'FBKEY-1234567890',
    },
    { isCreate: true }
  );
  assert.equal(err, null);
  assert.equal(target.facebookForwardEnabled, true);
  assert.equal(target.facebookStreamKey, 'FBKEY-1234567890');
});

test('listEnabledForwardTargets returns YouTube and Facebook when both on', () => {
  const targets = listEnabledForwardTargets({
    streamingDestination: 'server_youtube',
    streamProvider: 'rtmp',
    youtubeForwardEnabled: true,
    youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeStreamKey: 'xxxx-yyyy-zzzz',
    facebookForwardEnabled: true,
    facebookRtmpUrl: DEFAULT_FACEBOOK_RTMP,
    facebookStreamKey: 'FBKEY-1234567890',
  });
  assert.equal(targets.length, 2);
  assert.equal(targets[0].id, 'youtube');
  assert.equal(targets[1].id, 'facebook');
  assert.ok(targets[0].target.includes('xxxx-yyyy-zzzz'));
  assert.ok(targets[1].target.includes('FBKEY-1234567890'));
});

test('listEnabledForwardTargets server-only has no forwards', () => {
  const targets = listEnabledForwardTargets({
    streamingDestination: 'server',
    streamProvider: 'rtmp',
    youtubeForwardEnabled: false,
    facebookForwardEnabled: false,
  });
  assert.equal(targets.length, 0);
});

test('listEnabledForwardTargets youtube_server + facebook', () => {
  const targets = listEnabledForwardTargets({
    streamingDestination: 'youtube_server',
    streamProvider: 'rtmp',
    youtubeForwardEnabled: true,
    youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeStreamKey: 'aaaa-bbbb-cccc',
    facebookForwardEnabled: true,
    facebookRtmpUrl: DEFAULT_FACEBOOK_RTMP,
    facebookStreamKey: 'FBKEY-ABCDEFGH12',
  });
  assert.equal(targets.length, 2);
});

test('sanitize never leaks Facebook or YouTube keys', () => {
  const data = sanitizeStreamingSecrets(
    {
      youtubeStreamKey: 'yt-secret',
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

  const data2 = sanitizeForwardSecrets(
    { facebookStreamKey: 'x', youtubeStreamKey: 'y' },
    { hasFacebookStreamKey: true }
  );
  assert.equal(data2.facebookStreamKey, undefined);
  assert.equal(data2.facebookStreamKeySet, true);
});
