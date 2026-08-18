import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptYoutubeToken,
  decryptYoutubeToken,
  looksEncryptedToken,
  youtubeTokenEncryptionReady,
} from './youtubeTokenCrypto.js';

process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = 'unit-test-youtube-token-key-32';
process.env.NODE_ENV = 'test';

test('encrypts and decrypts a refresh token', () => {
  const plain = '1//refresh-token-value';
  const blob = encryptYoutubeToken(plain);
  assert.equal(looksEncryptedToken(blob), true);
  assert.equal(blob.includes(plain), false);
  assert.equal(decryptYoutubeToken(blob), plain);
});

test('encrypted blob is not the plaintext', () => {
  const plain = 'ya29.access-token-secret';
  const blob = encryptYoutubeToken(plain);
  assert.doesNotMatch(blob, /ya29/);
  assert.doesNotMatch(blob, /access-token-secret/);
});

test('empty token encrypts to empty string', () => {
  assert.equal(encryptYoutubeToken(''), '');
  assert.equal(decryptYoutubeToken(''), '');
});

test('youtubeTokenEncryptionReady is true when key is set', () => {
  assert.equal(youtubeTokenEncryptionReady(), true);
});
