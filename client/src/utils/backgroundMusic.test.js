import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampBackgroundMusicVolume,
  isValidBackgroundMusicId,
  publicSliceHasNoSecrets,
  shouldActivateLiveBackgroundMusic,
  shouldSuppressThemeMusic,
} from './backgroundMusic.js';

const CF_BGM = {
  liveIngestProvider: 'cloudflare_stream',
  backgroundMusicEnabled: true,
  backgroundMusicId: 'ambient-soft',
  backgroundMusicUrl: '/uploads/music/library/ambient-soft.mp3',
  backgroundMusicVolume: 0.35,
};

test('BGM enabled for Cloudflare event with valid catalog id and url', () => {
  assert.equal(shouldActivateLiveBackgroundMusic(CF_BGM), true);
});

test('BGM disabled when flag is false', () => {
  assert.equal(
    shouldActivateLiveBackgroundMusic({ ...CF_BGM, backgroundMusicEnabled: false }),
    false
  );
});

test('null stream config does not crash before the player loads', () => {
  assert.equal(shouldActivateLiveBackgroundMusic(null), false);
  assert.equal(shouldActivateLiveBackgroundMusic(undefined), false);
  assert.equal(shouldSuppressThemeMusic(null), false);
});

test('non-Cloudflare event does not start BGM', () => {
  assert.equal(
    shouldActivateLiveBackgroundMusic({
      ...CF_BGM,
      liveIngestProvider: 'mediamtx',
    }),
    false
  );
  assert.equal(
    shouldActivateLiveBackgroundMusic({
      ...CF_BGM,
      liveIngestProvider: undefined,
    }),
    false
  );
});

test('invalid or missing catalog id does not start BGM', () => {
  assert.equal(isValidBackgroundMusicId('ambient-soft'), true);
  assert.equal(isValidBackgroundMusicId('unknown-track'), false);
  assert.equal(
    shouldActivateLiveBackgroundMusic({ ...CF_BGM, backgroundMusicId: 'unknown-track' }),
    false
  );
  assert.equal(
    shouldActivateLiveBackgroundMusic({ ...CF_BGM, backgroundMusicUrl: '' }),
    false
  );
});

test('volume is clamped 0..1', () => {
  assert.equal(clampBackgroundMusicVolume(-1), 0);
  assert.equal(clampBackgroundMusicVolume(0), 0);
  assert.equal(clampBackgroundMusicVolume(0.35), 0.35);
  assert.equal(clampBackgroundMusicVolume(1), 1);
  assert.equal(clampBackgroundMusicVolume(9), 1);
});

test('no duplicate theme/live music: suppress theme music only when live BGM is eligible', () => {
  assert.equal(shouldSuppressThemeMusic(CF_BGM), true);
  assert.equal(shouldSuppressThemeMusic({ ...CF_BGM, backgroundMusicEnabled: false }), false);
  assert.equal(
    shouldSuppressThemeMusic({ ...CF_BGM, liveIngestProvider: 'mediamtx' }),
    false
  );
});

test('public BGM payload has no credentials', () => {
  assert.equal(
    publicSliceHasNoSecrets({
      backgroundMusicEnabled: true,
      backgroundMusicId: 'ambient-soft',
      backgroundMusicUrl: CF_BGM.backgroundMusicUrl,
      backgroundMusicVolume: 0.35,
    }),
    true
  );
  assert.equal(
    publicSliceHasNoSecrets({
      backgroundMusicEnabled: true,
      youtubeStreamKey: 'secret',
    }),
    false
  );
});
