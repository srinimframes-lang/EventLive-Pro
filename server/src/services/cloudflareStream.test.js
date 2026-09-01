import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-cf-stream-unit';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-cloudflare-stream-token';

const {
  CloudflareStreamError,
  shouldProvisionCloudflareLive,
  liveInputMetaName,
  mapLiveInputResult,
  applyCloudflareLiveInputFields,
  createLiveInput,
  createEventWithCloudflareLive,
  getCloudflareStreamConfig,
} = await import('../services/cloudflareStream.js');

const CF_HLS =
  'https://customer-test.cloudflarestream.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/manifest/video.m3u8';
const CF_RTMPS = 'rtmps://live.cloudflare.com:443/live/';
const SECRET_KEY = 'cf-rtmps-secret-key-do-not-log';

function cfApiResult(uid) {
  return {
    uid,
    rtmps: { url: CF_RTMPS, streamKey: SECRET_KEY },
    playback: { hls: CF_HLS },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('shouldProvisionCloudflareLive only for new Server/RTMP events', () => {
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'rtmp', streamingDestination: 'server' }),
    true,
  );
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'rtmp', streamingDestination: 'server_youtube' }),
    false,
  );
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'rtmp', streamingDestination: 'youtube_server' }),
    false,
  );
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'youtube', streamingDestination: 'youtube' }),
    false,
  );
  assert.equal(shouldProvisionCloudflareLive({ streamProvider: 'rtmp' }), false);
  assert.equal(shouldProvisionCloudflareLive({}), false);
});

test('liveInputMetaName is unique per event id', () => {
  const a = liveInputMetaName({ eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'one' });
  const b = liveInputMetaName({ eventId: 'bbbbbbbbbbbbbbbbbbbbbbbb', slug: 'one' });
  assert.match(a, /aaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.notEqual(a, b);
});

test('mapLiveInputResult stores CF fields and rejects incomplete payloads', () => {
  const mapped = mapLiveInputResult(cfApiResult('uid-1'));
  assert.equal(mapped.uid, 'uid-1');
  assert.equal(mapped.hlsUrl, CF_HLS);
  assert.equal(mapped.rtmpsUrl, CF_RTMPS);
  assert.equal(mapped.rtmpsKey, SECRET_KEY);

  assert.throws(
    () => mapLiveInputResult({ uid: 'x', rtmps: { url: CF_RTMPS }, playback: { hls: CF_HLS } }),
    (err) => {
      assert.equal(err.code, 'cloudflare_live_input_incomplete');
      assert.equal(String(err.message).includes(SECRET_KEY), false);
      return true;
    },
  );
});

test('applyCloudflareLiveInputFields does not write CF HLS into hlsUrl', () => {
  const payload = { title: 'New Server Event', hlsUrl: '' };
  applyCloudflareLiveInputFields(payload, mapLiveInputResult(cfApiResult('uid-2')));
  assert.equal(payload.liveIngestProvider, 'cloudflare_stream');
  assert.equal(payload.cfStreamLiveInputId, 'uid-2');
  assert.equal(payload.cfStreamHlsUrl, CF_HLS);
  assert.equal(payload.cfStreamRtmpsUrl, CF_RTMPS);
  assert.equal(payload.cfStreamRtmpsKey, SECRET_KEY);
  assert.equal(payload.hlsUrl, '');
});

test('applyCloudflareLiveInputFields clears a Cloudflare URL if it was placed in hlsUrl', () => {
  const payload = { hlsUrl: CF_HLS };
  applyCloudflareLiveInputFields(payload, mapLiveInputResult(cfApiResult('uid-3')));
  assert.equal(payload.hlsUrl, '');
  assert.equal(payload.cfStreamHlsUrl, CF_HLS);
});

test('createLiveInput POSTs a dedicated input and never logs the stream key', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
    return jsonResponse({ success: true, result: cfApiResult('live-uid-new') });
  };

  const created = await createLiveInput(
    { eventId: 'cccccccccccccccccccccccc', slug: 'new-live', title: 'New Live' },
    { fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/stream\/live_inputs$/);
  assert.equal(calls[0].body.recording.mode, 'off');
  assert.match(calls[0].body.meta.name, /cccccccccccccccccccccccc/);
  assert.equal(created.uid, 'live-uid-new');
  assert.equal(created.rtmpsKey, SECRET_KEY);
  assert.equal(JSON.stringify(calls[0].body).includes(SECRET_KEY), false);
});

test('createLiveInput fails cleanly when Cloudflare API errors', async () => {
  const fetchImpl = async () =>
    jsonResponse({ success: false, errors: [{ code: 10000, message: 'auth failed' }] }, 401);

  await assert.rejects(
    () => createLiveInput({ eventId: 'dddddddddddddddddddddddd' }, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof CloudflareStreamError);
      assert.equal(err.statusCode, 401);
      assert.equal(String(err.message).includes(SECRET_KEY), false);
      return true;
    },
  );
});

test('createLiveInput fails when credentials are missing — no MediaMTX fallback', async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      createLiveInput(
        { eventId: 'eeeeeeeeeeeeeeeeeeeeeeee' },
        {
          config: { accountId: '', apiToken: '', configured: false },
          fetchImpl: async () => {
            fetchCalled = true;
            return jsonResponse({ success: true });
          },
        },
      ),
    (err) => err.code === 'cloudflare_not_configured' && err.statusCode === 503,
  );
  assert.equal(fetchCalled, false);
  assert.equal(getCloudflareStreamConfig().configured, true);
});

test('createEventWithCloudflareLive provisions a dedicated input for Server/RTMP', async () => {
  const createdPayloads = [];
  const EventModel = {
    create: async (payload) => {
      createdPayloads.push(payload);
      return { _id: payload._id, ...payload };
    },
  };
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return jsonResponse({ success: true, result: cfApiResult(`uid-${fetchCount}`) });
  };

  const event = await createEventWithCloudflareLive(
    {
      title: 'Server Live',
      streamProvider: 'rtmp',
      streamingDestination: 'server',
      cfStreamLiveInputId: 'do-not-reuse-this',
      cfStreamRtmpsKey: 'other-event-key',
    },
    {
      EventModel,
      createLiveInput: (meta) => createLiveInput(meta, { fetchImpl }),
      deleteLiveInput: async () => true,
    },
  );

  assert.equal(fetchCount, 1);
  assert.equal(createdPayloads.length, 1);
  assert.equal(event.liveIngestProvider, 'cloudflare_stream');
  assert.equal(event.cfStreamLiveInputId, 'uid-1');
  assert.equal(event.cfStreamHlsUrl, CF_HLS);
  assert.notEqual(event.cfStreamLiveInputId, 'do-not-reuse-this');
  assert.equal(event.hlsUrl || '', '');
  assert.equal(String(event.hlsUrl || '').includes('cloudflarestream.com'), false);
});

test('createEventWithCloudflareLive does not touch MediaMTX-only destinations', async () => {
  let fetchCalled = false;
  const EventModel = {
    create: async (payload) => payload,
  };
  const event = await createEventWithCloudflareLive(
    {
      title: 'Server + YouTube',
      streamProvider: 'rtmp',
      streamingDestination: 'server_youtube',
    },
    {
      EventModel,
      createLiveInput: async () => {
        fetchCalled = true;
        throw new Error('should not create a Live Input');
      },
    },
  );
  assert.equal(fetchCalled, false);
  assert.equal(event.liveIngestProvider, undefined);
  assert.equal(event.cfStreamLiveInputId, undefined);
});

test('createEventWithCloudflareLive fails create when Live Input creation fails', async () => {
  let eventCreated = false;
  await assert.rejects(
    () =>
      createEventWithCloudflareLive(
        { title: 'Fail Server', streamProvider: 'rtmp', streamingDestination: 'server' },
        {
          EventModel: {
            create: async (payload) => {
              eventCreated = true;
              return payload;
            },
          },
          createLiveInput: async () => {
            throw new CloudflareStreamError('Cloudflare Live Input could not be created', {
              statusCode: 502,
              code: 'cloudflare_api_error',
            });
          },
        },
      ),
    (err) => err.code === 'cloudflare_api_error' && eventCreated === false,
  );
});

test('createEventWithCloudflareLive rolls back the Live Input if Event.create fails', async () => {
  const deleted = [];
  await assert.rejects(
    () =>
      createEventWithCloudflareLive(
        { title: 'Rollback Server', streamProvider: 'rtmp', streamingDestination: 'server' },
        {
          EventModel: {
            create: async () => {
              throw new Error('mongo write failed');
            },
          },
          createLiveInput: async () => mapLiveInputResult(cfApiResult('rollback-uid')),
          deleteLiveInput: async (uid) => {
            deleted.push(uid);
            return true;
          },
        },
      ),
    /mongo write failed/,
  );
  assert.deepEqual(deleted, ['rollback-uid']);
});

test('two new Server events receive two different Live Input UIDs', async () => {
  let n = 0;
  const EventModel = { create: async (payload) => payload };
  const createOne = () =>
    createEventWithCloudflareLive(
      { title: `Event ${n}`, streamProvider: 'rtmp', streamingDestination: 'server' },
      {
        EventModel,
        createLiveInput: async ({ eventId }) =>
          mapLiveInputResult(cfApiResult(`uid-for-${eventId}`)),
      },
    );

  const first = await createOne();
  const second = await createOne();
  assert.notEqual(String(first._id), String(second._id));
  assert.notEqual(first.cfStreamLiveInputId, second.cfStreamLiveInputId);
  assert.match(first.cfStreamLiveInputId, /^uid-for-/);
  assert.match(second.cfStreamLiveInputId, /^uid-for-/);
});
