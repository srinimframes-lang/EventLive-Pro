import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-oauth-unit';
process.env.YOUTUBE_CLIENT_ID = 'test-client-id';
process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/youtube/oauth/callback';
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = 'youtube-token-encryption-key-ok';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  YOUTUBE_OAUTH_SCOPES,
  sanitizeReturnTo,
  defaultReturnToForUser,
  frontendOAuthRedirectUrl,
  mapOauthCallbackError,
  safeYoutubeStatusPayload,
  publicYoutubeStatus,
} = await import('./youtubeOauth.js');

test('OAuth scopes are YouTube Live API scopes only', () => {
  assert.deepEqual(YOUTUBE_OAUTH_SCOPES, [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
  ]);
  assert.equal(YOUTUBE_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/youtube.upload'), false);
});

test('sanitizeReturnTo blocks open redirects', () => {
  const user = { role: 'customer' };
  assert.equal(sanitizeReturnTo('/dashboard', user), '/dashboard');
  assert.equal(sanitizeReturnTo('https://evil.example/phish', user), '/dashboard');
  assert.equal(sanitizeReturnTo('//evil.example', user), '/dashboard');
  assert.equal(sanitizeReturnTo('/admin', user), '/admin');
});

test('defaultReturnToForUser follows existing roles', () => {
  assert.equal(defaultReturnToForUser({ role: 'customer' }), '/dashboard');
  assert.equal(defaultReturnToForUser({ role: 'subadmin' }), '/reseller');
  assert.equal(defaultReturnToForUser({ role: 'admin' }), '/admin');
  assert.equal(defaultReturnToForUser({ role: 'superadmin' }), '/admin');
});

test('frontendOAuthRedirectUrl stays on EventLivePro', () => {
  const url = frontendOAuthRedirectUrl('/dashboard', { youtube: 'connected' });
  assert.match(url, /\/dashboard/);
  assert.match(url, /youtube=connected/);
  assert.equal(url.includes('evil'), false);
});

test('OAuth callback maps Google denial', () => {
  assert.equal(mapOauthCallbackError({ error: 'access_denied' }), 'denied');
  assert.equal(mapOauthCallbackError({}), '');
});

test('status payload never includes tokens or client secret', () => {
  const payload = safeYoutubeStatusPayload({
    connected: true,
    channelId: 'UCabc',
    channelTitle: 'Ravi Live',
    accessTokenEnc: 'iv:tag:cipher',
    refreshTokenEnc: 'iv:tag:cipher2',
  });
  assert.deepEqual(payload, {
    connected: true,
    channelId: 'UCabc',
    channelTitle: 'Ravi Live',
  });
  const raw = JSON.stringify(payload);
  assert.equal(/access_token|refresh_token|client_secret|accessTokenEnc|refreshTokenEnc/i.test(raw), false);
});

test('publicYoutubeStatus is disconnected when missing', () => {
  assert.deepEqual(publicYoutubeStatus(null), {
    connected: false,
    channelId: '',
    channelTitle: '',
  });
});
