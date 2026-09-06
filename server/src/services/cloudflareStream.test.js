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
  listLiveInputVideos,
  selectLatestCompletedLiveInputVideo,
  selectBroadcastRecordingVideo,
  captureCloudflareRecordedVideoUid,
  buildCloudflareRecordedHlsUrl,
  cloudflareRecordedPlaybackFields,
  publicCloudflareOfflinePlayback,
  CF_RECORDING_RETENTION_DAYS,
  cloudflareLiveInputRecordingPayload,
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
  assert.equal(calls[0].body.recording.mode, 'automatic');
  assert.equal(calls[0].body.recording.timeoutSeconds, 0);
  assert.equal(calls[0].body.deleteRecordingAfterDays, 30);
  assert.equal(CF_RECORDING_RETENTION_DAYS, 30);
  assert.equal(cloudflareLiveInputRecordingPayload().deleteRecordingAfterDays, 30);
  assert.equal(cloudflareLiveInputRecordingPayload().recording.mode, 'automatic');
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

test('listLiveInputVideos GETs live input videos and omits secrets', async () => {
  const liveInputId = 'live-input-uid-1';
  const videoUid = 'recorded-video-uid-1';
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
    return jsonResponse({
      success: true,
      result: [
        {
          uid: videoUid,
          playback: { hls: `${CF_HLS}` },
          status: { state: 'ready' },
          streamKey: SECRET_KEY,
        },
      ],
    });
  };

  const videos = await listLiveInputVideos(liveInputId, { fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, undefined);
  assert.match(
    calls[0].url,
    new RegExp(`/accounts/${accountId}/stream/live_inputs/${liveInputId}/videos$`),
  );
  assert.equal(videos.length, 1);
  assert.equal(videos[0].uid, videoUid);
  assert.equal(videos[0].status.state, 'ready');
  assert.equal(videos[0].streamKey, undefined);
  assert.equal(JSON.stringify(videos).includes(SECRET_KEY), false);
  assert.equal(JSON.stringify(videos).includes(apiToken), false);
});

test('listLiveInputVideos requires a live input id', async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      listLiveInputVideos('', {
        fetchImpl: async () => {
          fetchCalled = true;
          return jsonResponse({ success: true, result: [] });
        },
      }),
    (err) => err.code === 'cloudflare_live_input_id_required' && err.statusCode === 400,
  );
  assert.equal(fetchCalled, false);
});

test('Cloudflare event offline → video UID saved', async () => {
  const olderReady = {
    uid: 'older-ready-uid',
    created: '2026-09-01T10:00:00.000Z',
    status: { state: 'ready' },
    readyToStream: true,
  };
  const latestReady = {
    uid: 'latest-ready-uid',
    created: '2026-09-03T12:00:00.000Z',
    status: { state: 'ready' },
    readyToStream: true,
  };
  const inProgress = {
    uid: 'inprogress-uid',
    created: '2026-09-03T13:00:00.000Z',
    status: { state: 'inprogress' },
    readyToStream: false,
  };
  assert.equal(selectLatestCompletedLiveInputVideo([olderReady, inProgress, latestReady]).uid, 'latest-ready-uid');

  let listedId = '';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    streamingDestination: 'server',
    cfStreamLiveInputId: 'live-input-uid-new',
    cfStreamVideoUid: '',
    recordingUrl: '',
    recordingPath: '',
    recordings: [],
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async (liveInputId) => {
      listedId = liveInputId;
      return [olderReady, latestReady];
    },
  });

  assert.equal(listedId, 'live-input-uid-new');
  assert.equal(result.saved, true);
  assert.equal(result.uid, 'latest-ready-uid');
  assert.equal(event.cfStreamVideoUid, 'latest-ready-uid');
  assert.equal(
    selectBroadcastRecordingVideo([olderReady, inProgress, latestReady]).uid,
    'inprogress-uid',
  );
  assert.equal(selectBroadcastRecordingVideo([olderReady, inProgress, latestReady]).ready, false);
  assert.equal(event.recordingUrl, '');
  assert.equal(event.recordingPath, '');
  assert.deepEqual(event.recordings, []);
});

test('no completed video → nothing saved', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    streamingDestination: 'server',
    cfStreamLiveInputId: 'live-input-uid-new',
    cfStreamVideoUid: '',
    recordingUrl: '',
    recordingPath: '',
    recordings: [],
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async () => [
      {
        uid: 'not-ready-uid',
        created: '2026-09-03T12:00:00.000Z',
        status: { state: 'inprogress' },
        readyToStream: false,
      },
    ],
  });

  assert.equal(result.saved, false);
  assert.equal(result.reason, 'processing');
  assert.equal(result.uid, 'not-ready-uid');
  assert.equal(event.cfStreamVideoUid, '');
  assert.equal(event.recordingUrl, '');
  assert.equal(event.recordingPath, '');
  assert.deepEqual(event.recordings, []);
});

test('MediaMTX event → existing behavior unchanged', async () => {
  let listed = false;
  const event = {
    liveIngestProvider: 'mediamtx',
    streamProvider: 'rtmp',
    cfStreamLiveInputId: '',
    cfStreamVideoUid: '',
    recordingUrl: '/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording',
    recordingPath: '/var/recordings/event.mp4',
    recordings: [{ filename: 'event.mp4', localPath: '/var/recordings/event.mp4' }],
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async () => {
      listed = true;
      return [{ uid: 'should-not-save', status: { state: 'ready' }, readyToStream: true }];
    },
  });

  assert.equal(listed, false);
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'not_cloudflare');
  assert.equal(event.cfStreamVideoUid, '');
  assert.equal(event.recordingUrl, '/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording');
  assert.equal(event.recordingPath, '/var/recordings/event.mp4');
  assert.equal(event.recordings.length, 1);
});

test('offline Cloudflare event + cfStreamVideoUid → recorded HLS returned', () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const videoUid = 'cccccccccccccccccccccccccccccccc';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: videoUid,
  };
  const fields = cloudflareRecordedPlaybackFields(event, { isLive: false });
  const expected = `https://customer-test.cloudflarestream.com/${videoUid}/manifest/video.m3u8`;
  assert.equal(buildCloudflareRecordedHlsUrl(CF_HLS, videoUid, liveInputId), expected);
  assert.equal(fields.playbackMode, 'recorded');
  assert.equal(fields.recordingAvailable, true);
  assert.equal(fields.recordingUrl, '');
  assert.equal(fields.hlsUrl, expected);
  assert.equal(fields.playbackUrl, expected);

  const publicFields = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(publicFields.playbackMode, 'recorded');
  assert.equal(publicFields.recordingAvailable, true);
  assert.equal(publicFields.recordingUrl, '');
  assert.equal(publicFields.hlsUrl, expected);
  assert.equal(publicFields.cfRecordingPreparing, false);
  assert.equal(fields.hlsUrl.includes(liveInputId), false);
  assert.equal(String(fields.hlsUrl).includes('/stream/recording'), false);
});

test('offline Cloudflare event without video UID → existing behavior', () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    cfStreamLiveInputId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: '',
  };
  assert.equal(cloudflareRecordedPlaybackFields(event, { isLive: false }), null);
  assert.equal(buildCloudflareRecordedHlsUrl(CF_HLS, '', event.cfStreamLiveInputId), '');
  const preparing = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(preparing.playbackMode, 'offline');
  assert.equal(preparing.recordingAvailable, false);
  assert.equal(preparing.cfRecordingPreparing, true);
});

test('live Cloudflare event → live HLS unchanged', () => {
  const videoUid = 'cccccccccccccccccccccccccccccccc';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    cfStreamLiveInputId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: videoUid,
  };
  assert.equal(cloudflareRecordedPlaybackFields(event, { isLive: true }), null);
});

test('MediaMTX event → recorded Cloudflare HLS unchanged', () => {
  const event = {
    liveIngestProvider: 'mediamtx',
    streamProvider: 'rtmp',
    cfStreamLiveInputId: '',
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: 'cccccccccccccccccccccccccccccccc',
    recordingUrl: '/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording',
  };
  assert.equal(cloudflareRecordedPlaybackFields(event, { isLive: false }), null);
  assert.equal(publicCloudflareOfflinePlayback(event, { isLive: false }), null);
});

test('exact Video ID is the latest broadcast, not an older ready VOD', async () => {
  const olderReady = {
    uid: 'older-ready-uid',
    created: '2026-09-01T10:00:00.000Z',
    status: { state: 'ready' },
    readyToStream: true,
  };
  const latestProcessing = {
    uid: 'this-broadcast-uid',
    created: '2026-09-04T18:00:00.000Z',
    status: { state: 'inprogress' },
    readyToStream: false,
  };
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: 'live-input-uid-new',
    cfStreamVideoUid: '',
    liveStartedAt: '2026-09-04T17:00:00.000Z',
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async () => [olderReady, latestProcessing],
  });
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'processing');
  assert.equal(result.uid, 'this-broadcast-uid');
  assert.equal(event.cfStreamVideoUid, '');
});

test('existing cfStreamVideoUid and offline two days later stay on recorded HLS', () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const videoUid = 'cccccccccccccccccccccccccccccccc';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    status: 'ended',
    isLive: false,
    liveEndedAt: '2026-09-04T12:00:00.000Z',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: videoUid,
  };
  const fields = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(fields.playbackMode, 'recorded');
  assert.equal(fields.recordingAvailable, true);
  assert.equal(fields.recordingUrl, '');
  assert.equal(
    fields.hlsUrl,
    `https://customer-test.cloudflarestream.com/${videoUid}/manifest/video.m3u8`,
  );
  assert.equal(fields.cfRecordingPreparing, false);
  assert.equal(publicCloudflareOfflinePlayback(event, { isLive: true }), null);
});

test('30-day Live Input retention is configured on create payload', () => {
  const payload = cloudflareLiveInputRecordingPayload();
  assert.equal(CF_RECORDING_RETENTION_DAYS, 30);
  assert.equal(payload.recording.mode, 'automatic');
  assert.equal(payload.deleteRecordingAfterDays, 30);
});
