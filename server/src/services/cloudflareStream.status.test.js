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
  extractLiveInputStatusState,
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

function cfStatusObject(state) {
  return {
    current: {
      state,
      reason: state,
    },
    history: [],
  };
}

function cfLiveInputBody(status) {
  const statusPayload =
    status && typeof status === 'object' ? status : cfStatusObject(status);
  return {
    success: true,
    result: {
      uid: LIVE_INPUT_UID,
      status: statusPayload,
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

test('extractLiveInputStatusState reads status.current.state from the real API shape', () => {
  assert.equal(extractLiveInputStatusState(cfStatusObject('connected')), 'connected');
  assert.equal(extractLiveInputStatusState(cfStatusObject('reconnected')), 'reconnected');
  assert.equal(extractLiveInputStatusState('reconnecting'), 'reconnecting');
  assert.equal(extractLiveInputStatusState({ current: { state: 'connected' }, history: [] }), 'connected');
  assert.equal(extractLiveInputStatusState(null), '');
  assert.equal(extractLiveInputStatusState({ foo: 'bar' }), '');
  assert.equal(extractLiveInputStatusState({ current: { state: 1 } }), '');
  assert.equal(extractLiveInputStatusState({ current: {} }), '');
});

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
  assert.equal(mapLiveInputStatusToPublishing(cfStatusObject('connected')), true);
  assert.equal(mapLiveInputStatusToPublishing(cfStatusObject('reconnected')), true);
  assert.equal(mapLiveInputStatusToPublishing(cfStatusObject('reconnecting')), true);
  assert.equal(mapLiveInputStatusToPublishing(cfStatusObject('disconnected')), false);
  assert.equal(mapLiveInputStatusToPublishing(cfStatusObject('offline')), false);
  assert.equal(mapLiveInputStatusToPublishing(cfStatusObject('mystery')), null);
  assert.equal(mapLiveInputStatusToPublishing({ current: { state: 'connected' }, history: [] }), true);
  assert.equal(mapLiveInputStatusToPublishing({ foo: 'bar' }), null);
});

test('getLiveInputStatus: nested connected object → publishing, never "[object Object]"', async () => {
  const info = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody({ current: { state: 'connected' }, history: [] })),
  });
  assert.equal(info.uid, LIVE_INPUT_UID);
  assert.equal(info.status, 'connected');
  assert.notEqual(info.status, '[object Object]');
  assert.equal(info.isPublishing, true);
  assertNoSecrets(info);
});

test('getLiveInputStatus: nested reconnected/reconnecting → publishing', async () => {
  const reconnected = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody(cfStatusObject('reconnected'))),
  });
  assert.equal(reconnected.status, 'reconnected');
  assert.equal(reconnected.isPublishing, true);

  const reconnecting = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody(cfStatusObject('reconnecting'))),
  });
  assert.equal(reconnecting.status, 'reconnecting');
  assert.equal(reconnecting.isPublishing, true);
});

test('getLiveInputStatus: nested disconnected/offline → not publishing', async () => {
  const disconnected = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody(cfStatusObject('disconnected'))),
  });
  assert.equal(disconnected.status, 'disconnected');
  assert.equal(disconnected.isPublishing, false);

  const offline = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody(cfStatusObject('offline'))),
  });
  assert.equal(offline.isPublishing, false);
  assertNoSecrets(disconnected);
});

test('getLiveInputStatus: unknown nested state → isPublishing null', async () => {
  const info = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody(cfStatusObject('not-a-real-state'))),
  });
  assert.equal(info.status, 'not-a-real-state');
  assert.equal(info.isPublishing, null);
});

test('getLiveInputStatus: malformed status object → isPublishing null', async () => {
  const info = await getLiveInputStatus(LIVE_INPUT_UID, {
    fetchImpl: async () => jsonResponse(cfLiveInputBody({ current: { reason: 'connected' }, history: [] })),
  });
  assert.equal(info.status, '');
  assert.equal(info.isPublishing, null);
  assertNoSecrets(info);
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

test('publishingStatusForEvent connected stays live even when Mongo isLive is false', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: LIVE_INPUT_UID,
    streamProvider: 'rtmp',
    isLive: false,
  };
  const isPublishing = await publishingStatusForEvent(event, {
    getLiveInputStatus: async () => ({
      uid: LIVE_INPUT_UID,
      status: 'connected',
      isPublishing: true,
    }),
    probeMediaMtxPublishing: async () => {
      throw new Error('MediaMTX must not be probed for Cloudflare events');
    },
  });
  assert.equal(isPublishing, true);
});

test('publishingStatusForEvent disconnected is not live even when Mongo isLive is true', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: LIVE_INPUT_UID,
    streamProvider: 'rtmp',
    isLive: true,
  };
  const isPublishing = await publishingStatusForEvent(event, {
    getLiveInputStatus: async () => ({
      uid: LIVE_INPUT_UID,
      status: 'client_disconnect',
      isPublishing: false,
    }),
  });
  assert.equal(isPublishing, false);
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
