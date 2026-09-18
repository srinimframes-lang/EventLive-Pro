import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBackgroundMusicFields,
  clampBackgroundMusicVolume,
  isValidBackgroundMusicId,
  publicBackgroundMusicSlice,
  shouldActivateLiveBackgroundMusic,
  shouldSuppressThemeMusic,
} from './backgroundMusic.js';
import { sanitizeStreamingSecrets } from './youtubeForward.js';

test('clampBackgroundMusicVolume clamps to 0..1', () => {
  assert.equal(clampBackgroundMusicVolume(0.35), 0.35);
  assert.equal(clampBackgroundMusicVolume(-2), 0);
  assert.equal(clampBackgroundMusicVolume(4), 1);
  assert.equal(clampBackgroundMusicVolume('0.8'), 0.8);
  assert.equal(clampBackgroundMusicVolume('nope'), 0.35);
  assert.equal(clampBackgroundMusicVolume(undefined, 0.2), 0.2);
});

test('isValidBackgroundMusicId only accepts catalog ids', () => {
  assert.equal(isValidBackgroundMusicId('ambient-soft'), true);
  assert.equal(isValidBackgroundMusicId('AMBIENT-SOFT'), true);
  assert.equal(isValidBackgroundMusicId('not-a-track'), false);
  assert.equal(isValidBackgroundMusicId(''), false);
  assert.equal(isValidBackgroundMusicId(null), false);
});

test('null stream config does not crash before the player loads', () => {
  assert.equal(shouldActivateLiveBackgroundMusic(null), false);
  assert.equal(shouldActivateLiveBackgroundMusic(undefined), false);
  assert.equal(shouldSuppressThemeMusic(null), false);
});

test('BGM activates for Cloudflare events with enabled + valid id', () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    backgroundMusicEnabled: true,
    backgroundMusicId: 'ambient-soft',
    backgroundMusicVolume: 0.4,
  };
  assert.equal(shouldActivateLiveBackgroundMusic(event), true);
  const slice = publicBackgroundMusicSlice(event);
  assert.equal(slice.backgroundMusicEnabled, true);
  assert.equal(slice.backgroundMusicId, 'ambient-soft');
  assert.equal(slice.backgroundMusicVolume, 0.4);
  assert.ok(slice.backgroundMusicUrl);
  assert.equal(slice.backgroundMusicUrl.includes('music/library/ambient-soft.mp3'), true);
  assert.equal(slice.youtubeStreamKey, undefined);
  assert.equal(slice.cfStreamRtmpsKey, undefined);
});

test('BGM stays disabled when the flag is off', () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    backgroundMusicEnabled: false,
    backgroundMusicId: 'ambient-soft',
  };
  assert.equal(shouldActivateLiveBackgroundMusic(event), false);
  const slice = publicBackgroundMusicSlice(event);
  assert.equal(slice.backgroundMusicEnabled, false);
  assert.equal(slice.backgroundMusicId, null);
  assert.equal(slice.backgroundMusicUrl, '');
});

test('non-Cloudflare events do not start BGM and omit the public slice', () => {
  const mediamtx = {
    liveIngestProvider: 'mediamtx',
    backgroundMusicEnabled: true,
    backgroundMusicId: 'ambient-soft',
    youtubeStreamKey: 'secret-yt-key',
  };
  assert.equal(shouldActivateLiveBackgroundMusic(mediamtx), false);
  assert.equal(publicBackgroundMusicSlice(mediamtx), null);

  const youtubeOnly = {
    liveIngestProvider: 'mediamtx',
    streamProvider: 'youtube',
    backgroundMusicEnabled: true,
    backgroundMusicId: 'ambient-soft',
  };
  assert.equal(shouldActivateLiveBackgroundMusic(youtubeOnly), false);
  assert.equal(publicBackgroundMusicSlice(youtubeOnly), null);
});

test('invalid catalog id does not enable public BGM', () => {
  const slice = publicBackgroundMusicSlice({
    liveIngestProvider: 'cloudflare_stream',
    backgroundMusicEnabled: true,
    backgroundMusicId: 'copyrighted-hit',
  });
  assert.equal(slice.backgroundMusicEnabled, false);
  assert.equal(slice.backgroundMusicId, null);
  assert.equal(shouldActivateLiveBackgroundMusic({
    liveIngestProvider: 'cloudflare_stream',
    backgroundMusicEnabled: true,
    backgroundMusicId: 'copyrighted-hit',
  }), false);
});

test('applyBackgroundMusicFields ignores MediaMTX events', () => {
  const target = { liveIngestProvider: 'mediamtx' };
  const err = applyBackgroundMusicFields(
    target,
    { backgroundMusicEnabled: true, backgroundMusicId: 'ambient-soft' },
    { isCloudflare: false }
  );
  assert.equal(err, null);
  assert.equal(target.backgroundMusicEnabled, undefined);
  assert.equal(target.backgroundMusicId, undefined);
});

test('applyBackgroundMusicFields stores clamped volume on Cloudflare events', () => {
  const target = { liveIngestProvider: 'cloudflare_stream' };
  const err = applyBackgroundMusicFields(
    target,
    {
      backgroundMusicEnabled: true,
      backgroundMusicId: 'ambient-soft',
      backgroundMusicVolume: 2.5,
    },
    { isCloudflare: true }
  );
  assert.equal(err, null);
  assert.equal(target.backgroundMusicEnabled, true);
  assert.equal(target.backgroundMusicId, 'ambient-soft');
  assert.equal(target.backgroundMusicVolume, 1);
});

test('theme music is suppressed only when live BGM is eligible', () => {
  assert.equal(
    shouldSuppressThemeMusic({
      liveIngestProvider: 'cloudflare_stream',
      backgroundMusicEnabled: true,
      backgroundMusicId: 'ambient-soft',
    }),
    true
  );
  assert.equal(
    shouldSuppressThemeMusic({
      liveIngestProvider: 'cloudflare_stream',
      backgroundMusicEnabled: false,
      backgroundMusicId: 'ambient-soft',
    }),
    false
  );
  assert.equal(
    shouldSuppressThemeMusic({
      liveIngestProvider: 'mediamtx',
      backgroundMusicEnabled: true,
      backgroundMusicId: 'ambient-soft',
    }),
    false
  );
});

test('public BGM slice never exposes streaming credentials', () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    backgroundMusicEnabled: true,
    backgroundMusicId: 'ambient-soft',
    youtubeStreamKey: 'yt-secret',
    facebookStreamKey: 'fb-secret',
    rtmpStreamKey: 'rtmp-secret',
    cfStreamRtmpsKey: 'cf-secret',
  };
  const slice = publicBackgroundMusicSlice(event);
  const sanitized = sanitizeStreamingSecrets(
    { ...event, ...slice },
    { hasYoutubeStreamKey: true, hasFacebookStreamKey: true }
  );
  assert.equal(slice.youtubeStreamKey, undefined);
  assert.equal(slice.facebookStreamKey, undefined);
  assert.equal(slice.rtmpStreamKey, undefined);
  assert.equal(slice.cfStreamRtmpsKey, undefined);
  assert.equal(sanitized.youtubeStreamKey, undefined);
  assert.equal(sanitized.cfStreamRtmpsKey, undefined);
  assert.equal(sanitized.backgroundMusicEnabled, true);
  assert.equal(sanitized.backgroundMusicId, 'ambient-soft');
});
