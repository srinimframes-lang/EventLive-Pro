import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-cf-status-unit';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-cloudflare-stream-token';

const {
  getLiveInputStatus,
  mapLiveInputStatusToPublishing,
} = await import('../services/cloudflareStream.js');
const { publishingStatusForEvent } = await import('../controllers/stream.controller.js');

const LIVE_INPUT_UID = '66be4bf738797e01e1fca35a7bdecdcd';
const SECRET_KEY = 'cf-rtmps-secret-key-do-not-log';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function cfLiveInputBody(status) {
  return {
    success: true,
    result: {
      uid: LIVE_INPUT_UID,
      status,
      enabled: true,
      rtmps: { url: 'rtmps://live.cloudflare.com:443/live/', streamKey: SECRET_KEY },
      playback: {
        hls: 'https://customer-test.cloudflarestream.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest/video.m3u8',
      },
    },
  };
}

function assertNoSecrets(value) {
  const dumped = JSON.stringify(value);
  assert.equal(dumped.includes(SECRET_KEY), false);
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'rtmps'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'rtmpsKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'streamKey'), false);
}

test('mapLiveInputStatusToPublishing uses official Cloudflare status strings', () => {
  assert.equal(mapLiveInputStatusToPublishing('connected'), true);
  assert.equal(mapLiveInputStatusToPublishing('reconnected'), true);
  assert.equal(mapLiveInputStatusToPublishing('reconnecting'), true);
  assert.equal(mapLiveInputStatusToPublishing('client_disconnect'), false);
  assert.equal(mapLiveInputStatusToPublishing('ttl_exceeded'), false);
  assert.equal(mapLiveInputStatusToPublishing('failed_to_connect'), false);
  assert.equal(mapLiveInputStatusToPublishing('failed_to_reconnect'), false);
  assert.equal(mapLiveInputStatusToPublishing('new_configuration_accepted'), false);
  assert.equal(mapLiveInputStatusToPublishing('disconnected'), false);
  assert.equal(mapLiveInputStatusToPublishing('offline'), false);
  assert.equal(mapLiveInputStatusToPublishing(''), null);
  assert.equal(mapLiveInputStatusToPublishing('unknown-future-status'), null);
});

test('getLiveInputStatus: connected → publishing, no secrets returned', async () => {
  const info = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody('connected')),
  });
  assert.equal(info.uid, LIVE_INPUT_UID);
  assert.equal(info.status, 'connected');
  assert.equal(info.isPublishing, true);
  assertNoSecrets(info);
});

test('getLiveInputStatus: reconnecting → publishing', async () => {
  const info = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody('reconnecting')),
  });
  assert.equal(info.status, 'reconnecting');
  assert.equal(info.isPublishing, true);
  assertNoSecrets(info);
});

test('getLiveInputStatus: disconnected/offline → not publishing', async () => {
  const disconnected = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody('client_disconnect')),
  });
  assert.equal(disconnected.status, 'client_disconnect');
  assert.equal(disconnected.isPublishing, false);

  const ttl = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody('ttl_exceeded')),
  });
  assert.equal(ttl.isPublishing, false);

  const offline = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody('offline')),
  });
  assert.equal(offline.isPublishing, false);
  assertNoSecrets(disconnected);
});

test('getLiveInputStatus: Cloudflare API failure → isPublishing null', async () => {
  const info = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () =>
      jsonResponse({ success: false, errors: [{ code: 10000, message: 'auth failed' }] }, 401),
  });
  assert.equal(info.uid, LIVE_INPUT_UID);
  assert.equal(info.isPublishing, null);
  assertNoSecrets(info);
});

test('publishingStatusForEvent uses Cloudflare status for cloudflare_stream events', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: LIVE_INPUT_UID,
    streamProvider: 'rtmp',
  };
  let mtxCalled = false;
  const isPublishing = await publishingStatusForEvent(event, {
    getLiveInputStatus: async () => ({ uid: LIVE_INPUT_UID, status: 'connected', isPublishing: true }),
    probeMediaMtxPublishing: async () => {
      mtxCalled = true;
      return true;
    },
  });
  assert.equal(isPublishing, true);
  assert.equal(mtxCalled, false);
});

test('publishingStatusForEvent Cloudflare API failure returns null (event.isLive fallback)', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: LIVE_INPUT_UID,
    streamProvider: 'rtmp',
  };
  const isPublishing = await publishingStatusForEvent(event, {
    getLiveInputStatus: async () => {
      throw new Error('network');
    },
  });
  assert.equal(isPublishing, null);
});

test('publishingStatusForEvent MediaMTX events still use MediaMTX probe', async () => {
  const event = {
    liveIngestProvider: 'mediamtx',
    streamProvider: 'rtmp',
    rtmpStreamKey: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  };
  let cfCalled = false;
  let mtxKey = '';
  const isPublishing = await publishingStatusForEvent(event, {
    getLiveInputStatus: async () => {
      cfCalled = true;
      return { isPublishing: true };
    },
    probeMediaMtxPublishing: async (key) => {
      mtxKey = String(key || '');
      return true;
    },
  });
  assert.equal(cfCalled, false);
  assert.equal(mtxKey, 'aaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(isPublishing, true);
});

test('publishingStatusForEvent missing liveIngestProvider stays on MediaMTX probe', async () => {
  const event = {
    streamProvider: 'rtmp',
    rtmpStreamKey: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  };
  let mtxCalled = false;
  await publishingStatusForEvent(event, {
    getLiveInputStatus: async () => ({ isPublishing: true }),
    probeMediaMtxPublishing: async () => {
      mtxCalled = true;
      return false;
    },
  });
  assert.equal(mtxCalled, true);
});
