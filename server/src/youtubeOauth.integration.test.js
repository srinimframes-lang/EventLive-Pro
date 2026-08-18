import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-oauth-int';
process.env.YOUTUBE_CLIENT_ID = 'test-client-id';
process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/youtube/oauth/callback';
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = 'youtube-token-encryption-key-ok';
process.env.CLIENT_URL = 'http://localhost:5173';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    redirectUrl: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set() {
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.redirectUrl = url;
      return this;
    },
  };
}

async function invoke(handler, req) {
  const res = mockRes();
  await new Promise((resolve, reject) => {
    Promise.resolve(handler(req, res, reject)).then(resolve).catch(reject);
  });
  return res;
}

const mongod = await MongoMemoryServer.create({ instance: { dbName: 'eventlive' } });
process.env.MONGODB_URI = mongod.getUri('eventlive');
await mongoose.connect(process.env.MONGODB_URI);

const { User } = await import('./models/User.js');
const { YoutubeCredential } = await import('./models/YoutubeCredential.js');
const { YoutubeOauthState } = await import('./models/YoutubeOauthState.js');
const {
  startYoutubeOauth,
  youtubeOauthCallback,
  youtubeOauthStatus,
  disconnectYoutubeOauth,
} = await import('./controllers/youtubeOauth.controller.js');
const { setYoutubeGoogleAdapter, resetYoutubeGoogleAdapter } = await import('./utils/youtubeGoogle.js');
const { decryptYoutubeToken } = await import('./utils/youtubeTokenCrypto.js');
const { looksEncryptedToken } = await import('./utils/youtubeTokenCrypto.js');

const customerA = await User.create({
  name: 'Customer A',
  email: 'yt-a@test.com',
  password: 'password123',
  role: 'customer',
  approved: true,
});
const customerB = await User.create({
  name: 'Customer B',
  email: 'yt-b@test.com',
  password: 'password123',
  role: 'customer',
  approved: true,
});

setYoutubeGoogleAdapter({
  generateAuthUrl() {
    return 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id&state=mock';
  },
  async getToken(_client, code) {
    if (code === 'bad-code') {
      const err = new Error('invalid_grant');
      err.response = { data: { error: 'invalid_grant' } };
      throw err;
    }
    return {
      access_token: 'ya29.access-secret',
      refresh_token: '1//refresh-secret',
      expiry_date: Date.now() + 3600_000,
      scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl',
    };
  },
  async getMineChannel() {
    return {
      channelId: 'UCchannelA',
      channelTitle: 'Aarav Live',
      googleAccountId: 'UCchannelA',
    };
  },
  async revokeToken() {
    return undefined;
  },
});

describe('YouTube OAuth integration', { concurrency: 1 }, () => {
test('OAuth start requires authentication', async () => {
  let failed = false;
  try {
    const res = await invoke(startYoutubeOauth, { user: null, query: {}, headers: { accept: 'application/json' } });
    if (res.statusCode === 401) failed = true;
  } catch (err) {
    failed = /not authorized/i.test(err.message);
  }
  assert.equal(failed, true);
});

test('OAuth start generates state', async () => {
  const res = await invoke(startYoutubeOauth, {
    user: customerA,
    query: { returnTo: '/dashboard', format: 'json' },
    headers: { accept: 'application/json' },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body.data.authUrl, /accounts\.google\.com/);
  const count = await YoutubeOauthState.countDocuments({ user: customerA._id });
  assert.equal(count >= 1, true);
});

test('invalid state is rejected', async () => {
  const res = await invoke(youtubeOauthCallback, {
    query: { state: 'nope', code: 'abc' },
    headers: {},
  });
  assert.equal(res.statusCode, 302);
  assert.match(res.redirectUrl, /youtube=invalid/);
});

test('expired state is rejected', async () => {
  await YoutubeOauthState.create({
    state: 'expired-state-token',
    user: customerA._id,
    returnTo: '/dashboard',
    expiresAt: new Date(Date.now() - 1000),
  });
  const res = await invoke(youtubeOauthCallback, {
    query: { state: 'expired-state-token', code: 'abc' },
    headers: {},
  });
  assert.equal(res.statusCode, 302);
  assert.match(res.redirectUrl, /youtube=expired/);
});

test('OAuth callback handles Google denial', async () => {
  const res = await invoke(youtubeOauthCallback, {
    query: { error: 'access_denied', state: 'x' },
    headers: {},
  });
  assert.equal(res.statusCode, 302);
  assert.match(res.redirectUrl, /youtube=denied/);
});

test('OAuth callback handles invalid code', async () => {
  const start = await invoke(startYoutubeOauth, {
    user: customerA,
    query: { format: 'json' },
    headers: { accept: 'application/json' },
  });
  const row = await YoutubeOauthState.findOne({ user: customerA._id }).sort({ createdAt: -1 });
  assert.ok(row);
  const res = await invoke(youtubeOauthCallback, {
    query: { state: row.state, code: 'bad-code' },
    headers: {},
  });
  assert.equal(res.statusCode, 302);
  assert.match(res.redirectUrl, /youtube=error/);
  void start;
});

test('successful callback stores encrypted credentials', async () => {
  const start = await invoke(startYoutubeOauth, {
    user: customerA,
    query: { format: 'json' },
    headers: { accept: 'application/json' },
  });
  const row = await YoutubeOauthState.findOne({ user: customerA._id }).sort({ createdAt: -1 });
  const res = await invoke(youtubeOauthCallback, {
    query: { state: row.state, code: 'good-code' },
    headers: {},
  });
  assert.equal(res.statusCode, 302);
  assert.match(res.redirectUrl, /youtube=connected/);
  const cred = await YoutubeCredential.findOne({ user: customerA._id }).select(
    '+refreshTokenEnc +accessTokenEnc'
  );
  assert.equal(cred.connected, true);
  assert.equal(cred.channelId, 'UCchannelA');
  assert.equal(looksEncryptedToken(cred.refreshTokenEnc), true);
  assert.equal(decryptYoutubeToken(cred.refreshTokenEnc), '1//refresh-secret');
  assert.equal(String(cred.refreshTokenEnc).includes('refresh-secret'), false);
  void start;
});

test('status endpoint never returns tokens', async () => {
  const res = await invoke(youtubeOauthStatus, {
    user: customerA,
    query: {},
    headers: { accept: 'application/json' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.connected, true);
  assert.equal(res.body.data.channelTitle, 'Aarav Live');
  const raw = JSON.stringify(res.body);
  assert.equal(/access_token|refresh_token|client_secret|ya29|1\/\//i.test(raw), false);
  assert.equal(res.body.data.accessTokenEnc, undefined);
  assert.equal(res.body.data.refreshTokenEnc, undefined);
});

test('customer A cannot read customer B credentials via status', async () => {
  const res = await invoke(youtubeOauthStatus, {
    user: customerB,
    query: {},
    headers: { accept: 'application/json' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.connected, false);
  assert.equal(res.body.data.channelId, '');
});

test('customer A cannot disconnect customer B', async () => {
  await YoutubeCredential.create({
    user: customerB._id,
    connected: true,
    channelId: 'UCchannelB',
    channelTitle: 'Priya Live',
  });
  let forbidden = false;
  try {
    const res = await invoke(disconnectYoutubeOauth, {
      user: customerA,
      body: { userId: String(customerB._id) },
      headers: { accept: 'application/json' },
    });
    if (res.statusCode === 403) forbidden = true;
  } catch (err) {
    forbidden = /own YouTube/i.test(err.message);
  }
  assert.equal(forbidden, true);
  const stillA = await YoutubeCredential.findOne({ user: customerA._id });
  const stillB = await YoutubeCredential.findOne({ user: customerB._id });
  assert.equal(Boolean(stillA?.connected), true);
  assert.equal(Boolean(stillB?.connected), true);
});

test('disconnect works for the authenticated user only', async () => {
  const res = await invoke(disconnectYoutubeOauth, {
    user: customerA,
    body: {},
    headers: { accept: 'application/json' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.connected, false);
  const gone = await YoutubeCredential.findOne({ user: customerA._id });
  assert.equal(gone, null);
  const other = await YoutubeCredential.findOne({ user: customerB._id });
  assert.equal(other?.channelId, 'UCchannelB');
});
});

after(async () => {
  resetYoutubeGoogleAdapter();
  await mongoose.disconnect();
  await mongod.stop();
});
