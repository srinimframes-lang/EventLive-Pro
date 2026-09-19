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
  classifyCloudflareHlsManifest,
  isCloudflareLiveInputVideoUid,
  resolveCloudflareRecordedPlaybackUrl,
  cloudflareRecordedPlaybackFields,
  publicCloudflareOfflinePlayback,
  CF_RECORDING_RETENTION_DAYS,
  CF_RECORDING_DISCONNECT_TIMEOUT_SECONDS,
  cloudflareLiveInputRecordingPayload,
  liveInputRecordingNeedsEnsure,
  beginCloudflareLiveBroadcast,
  isStaleCloudflareRecordedUid,
  needsCloudflareRecordingUid,
  normalizeLiveInputVideosResult,
  videoBelongsToLiveInput,
  ensureCloudflareLiveInputRecording,
  ensureCloudflareLiveInputRecordingForEvent,
  reconcileOfflineCloudflareRecordings,
  buildCloudflareStreamIframeUrl,
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

test('shouldProvisionCloudflareLive for all new Server-related destinations', () => {
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'rtmp', streamingDestination: 'server' }),
    true,
  );
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'rtmp', streamingDestination: 'server_youtube' }),
    true,
  );
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'rtmp', streamingDestination: 'youtube_server' }),
    true,
  );
  assert.equal(
    shouldProvisionCloudflareLive({ streamProvider: 'youtube', streamingDestination: 'youtube' }),
    false,
  );
  assert.equal(shouldProvisionCloudflareLive({ streamProvider: 'rtmp' }), false);
  assert.equal(shouldProvisionCloudflareLive({}), false);
  assert.equal(
    shouldProvisionCloudflareLive({
      streamProvider: 'rtmp',
      streamingDestination: 'server',
      streamingProvider: 'external_embed',
    }),
    false,
  );
  assert.equal(
    shouldProvisionCloudflareLive({
      streamProvider: 'rtmp',
      streamingDestination: 'server',
      streamingProvider: 'mux',
    }),
    false,
  );
  assert.equal(
    shouldProvisionCloudflareLive({
      streamProvider: 'rtmp',
      streamingDestination: 'server',
      streamingProvider: 'mediamtx',
    }),
    false,
  );
  assert.equal(
    shouldProvisionCloudflareLive({
      streamProvider: 'youtube',
      streamingDestination: 'youtube',
      streamingProvider: 'youtube',
    }),
    false,
  );
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
  assert.equal(calls[0].body.recording.timeoutSeconds, 30);
  assert.equal(calls[0].body.recording.requireSignedURLs, false);
  assert.equal(calls[0].body.timeoutSeconds, 30);
  assert.equal(calls[0].body.deleteRecordingAfterDays, 30);
  assert.equal(CF_RECORDING_RETENTION_DAYS, 30);
  assert.equal(CF_RECORDING_DISCONNECT_TIMEOUT_SECONDS, 30);
  assert.equal(cloudflareLiveInputRecordingPayload().deleteRecordingAfterDays, 30);
  assert.equal(cloudflareLiveInputRecordingPayload().recording.mode, 'automatic');
  assert.equal(cloudflareLiveInputRecordingPayload().recording.timeoutSeconds, 30);
  assert.notEqual(cloudflareLiveInputRecordingPayload().recording.timeoutSeconds, 0);
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

test('createEventWithCloudflareLive provisions Server+YouTube and YouTube+Server without dropping destination', async () => {
  const created = [];
  const EventModel = {
    create: async (payload) => {
      created.push(payload);
      return payload;
    },
  };
  let n = 0;
  const createLiveInput = async () => mapLiveInputResult(cfApiResult(`combo-uid-${++n}`));

  const serverYoutube = await createEventWithCloudflareLive(
    {
      title: 'Server + YouTube',
      streamProvider: 'rtmp',
      streamingDestination: 'server_youtube',
      youtubeForwardEnabled: true,
    },
    { EventModel, createLiveInput, deleteLiveInput: async () => true },
  );
  assert.equal(serverYoutube.liveIngestProvider, 'cloudflare_stream');
  assert.equal(serverYoutube.streamingDestination, 'server_youtube');
  assert.equal(serverYoutube.youtubeForwardEnabled, true);
  assert.equal(serverYoutube.cfStreamLiveInputId, 'combo-uid-1');

  const youtubeServer = await createEventWithCloudflareLive(
    {
      title: 'YouTube + Server',
      streamProvider: 'rtmp',
      streamingDestination: 'youtube_server',
      youtubeForwardEnabled: true,
      youtubeVideoId: 'dQw4w9WgXcQ',
    },
    { EventModel, createLiveInput, deleteLiveInput: async () => true },
  );
  assert.equal(youtubeServer.liveIngestProvider, 'cloudflare_stream');
  assert.equal(youtubeServer.streamingDestination, 'youtube_server');
  assert.equal(youtubeServer.youtubeForwardEnabled, true);
  assert.equal(youtubeServer.youtubeVideoId, 'dQw4w9WgXcQ');
  assert.equal(youtubeServer.cfStreamLiveInputId, 'combo-uid-2');
  assert.equal(created.length, 2);
});

test('createEventWithCloudflareLive does not provision YouTube-only events', async () => {
  let fetchCalled = false;
  const EventModel = {
    create: async (payload) => payload,
  };
  const event = await createEventWithCloudflareLive(
    {
      title: 'YouTube Only',
      streamProvider: 'youtube',
      streamingDestination: 'youtube',
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
  assert.equal(event.streamingDestination, 'youtube');
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
    liveStartedAt: '2026-09-03T11:00:00.000Z',
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
  assert.equal(event.cfStreamPendingVideoUid, 'not-ready-uid');
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
  assert.equal(
    fields.playerUrl,
    `https://customer-test.cloudflarestream.com/${videoUid}/iframe`,
  );
  assert.equal(fields.playerUrl.includes(liveInputId), false);

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
  assert.equal(payload.recording.timeoutSeconds, 30);
  assert.equal(payload.deleteRecordingAfterDays, 30);
  assert.equal(payload.timeoutSeconds, 30);
  assert.equal(liveInputRecordingNeedsEnsure({ recordingMode: 'automatic', timeoutSeconds: 30, deleteRecordingAfterDays: 30 }), false);
  assert.equal(liveInputRecordingNeedsEnsure({ recordingMode: 'automatic', timeoutSeconds: 0, deleteRecordingAfterDays: 30 }), true);
  assert.equal(liveInputRecordingNeedsEnsure({ recordingMode: 'off', timeoutSeconds: 30, deleteRecordingAfterDays: 30 }), true);
  assert.equal(liveInputRecordingNeedsEnsure({ recordingMode: 'automatic', timeoutSeconds: 30, deleteRecordingAfterDays: 7 }), true);
});

test('listLiveInputVideos accepts wrapped Cloudflare video payloads', () => {
  assert.deepEqual(
    normalizeLiveInputVideosResult({
      videos: [{ uid: 'wrapped-uid', status: { state: 'ready' }, readyToStream: true }],
    }).map((v) => v.uid),
    ['wrapped-uid'],
  );
  assert.equal(normalizeLiveInputVideosResult({ uid: 'single-uid' })[0].uid, 'single-uid');
  assert.equal(videoBelongsToLiveInput({ uid: 'v1', liveInput: 'live-1' }, 'live-1'), true);
  assert.equal(videoBelongsToLiveInput({ uid: 'v1', liveInput: 'other' }, 'live-1'), false);
});

test('listLiveInputVideos falls back to GET /stream filtered by liveInput', async () => {
  const liveInputId = 'live-input-fallback';
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes(`/live_inputs/${liveInputId}/videos`)) {
      return jsonResponse({ success: true, result: [] });
    }
    return jsonResponse({
      success: true,
      result: [
        {
          uid: 'account-other-vod',
          liveInput: 'someone-else',
          status: { state: 'ready' },
          readyToStream: true,
        },
        {
          uid: 'this-input-vod',
          liveInput: liveInputId,
          status: { state: 'ready' },
          readyToStream: true,
          created: '2026-09-09T12:00:00.000Z',
        },
      ],
    });
  };
  const videos = await listLiveInputVideos(liveInputId, { fetchImpl });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /\/stream(\?|$)/);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].uid, 'this-input-vod');
});

test('protected Live Input still captures the Video UID', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: 'f175154f728840ce4408e98c13c24302',
    cfStreamVideoUid: '',
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async () => [
      {
        uid: 'protected-vod-uid',
        created: '2026-09-09T10:00:00.000Z',
        status: { state: 'ready' },
        readyToStream: true,
      },
    ],
  });
  assert.equal(result.saved, true);
  assert.equal(result.uid, 'protected-vod-uid');
  assert.equal(event.cfStreamVideoUid, 'protected-vod-uid');
  assert.equal(event.cfStreamPendingVideoUid, '');
});

test('old Video UID is not reused for a new broadcast', () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const oldUid = 'old-broadcast-uid-old-broadcast-uid';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    status: 'ended',
    isLive: false,
    liveStartedAt: '2026-09-09T18:00:00.000Z',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: oldUid,
    cfStreamVideoCapturedAt: '2026-09-01T10:00:00.000Z',
  };
  assert.equal(isStaleCloudflareRecordedUid(event), true);
  assert.equal(needsCloudflareRecordingUid(event), true);
  const preparing = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(preparing.playbackMode, 'offline');
  assert.equal(preparing.cfRecordingPreparing, true);

  const started = beginCloudflareLiveBroadcast(event, { now: new Date('2026-09-09T18:00:00.000Z') });
  assert.equal(started.newSession, true);
  assert.equal(event.cfStreamVideoUid, '');
  assert.equal(event.cfStreamPendingVideoUid, '');
  assert.equal(event.isLive, true);
  assert.equal(event.status, 'live');
});

test('reconnect within a live session does not clear the current VOD UID', () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    status: 'live',
    isLive: true,
    liveReconnecting: true,
    liveStartedAt: '2026-09-09T17:00:00.000Z',
    cfStreamVideoUid: '',
    cfStreamPendingVideoUid: 'pending-this-session',
  };
  const result = beginCloudflareLiveBroadcast(event, { now: new Date('2026-09-09T17:05:00.000Z') });
  assert.equal(result.newSession, false);
  assert.equal(event.cfStreamPendingVideoUid, 'pending-this-session');
  assert.equal(String(event.liveStartedAt), '2026-09-09T17:00:00.000Z');
});

test('ensureCloudflareLiveInputRecording PUTs automatic + 30-day config when timeout is 0', async () => {
  const puts = [];
  const result = await ensureCloudflareLiveInputRecording('live-input-uid-1', {
    getLiveInputRecordingConfig: async () => ({
      uid: 'live-input-uid-1',
      recordingMode: 'automatic',
      timeoutSeconds: 0,
      deleteRecordingAfterDays: null,
    }),
    updateLiveInputRecording: async (uid) => {
      puts.push(uid);
      return { updated: true, uid };
    },
  });
  assert.equal(result.updated, true);
  assert.deepEqual(puts, ['live-input-uid-1']);
});

test('ensureCloudflareLiveInputRecordingForEvent skips a second PUT for the same input', async () => {
  let puts = 0;
  const deps = {
    getLiveInputRecordingConfig: async () => ({
      uid: 'live-input-uid-ensure-once',
      recordingMode: 'automatic',
      timeoutSeconds: 0,
      deleteRecordingAfterDays: null,
    }),
    updateLiveInputRecording: async () => {
      puts += 1;
      return { updated: true };
    },
  };
  const event = { cfStreamLiveInputId: 'live-input-uid-ensure-once' };
  const first = await ensureCloudflareLiveInputRecordingForEvent(event, deps);
  const second = await ensureCloudflareLiveInputRecordingForEvent(event, deps);
  assert.equal(first.updated, true);
  assert.equal(second.reason, 'already_ensured');
  assert.equal(puts, 1);
});

test('buildCloudflareStreamIframeUrl uses stored customer host and the given UID', () => {
  const liveInputId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const videoUid = 'cccccccccccccccccccccccccccccccc';
  const hls = `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${liveInputId}/manifest/video.m3u8`;
  assert.equal(
    buildCloudflareStreamIframeUrl(hls, liveInputId),
    `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${liveInputId}/iframe`,
  );
  assert.equal(
    buildCloudflareStreamIframeUrl(hls, videoUid),
    `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${videoUid}/iframe`,
  );
  assert.equal(buildCloudflareStreamIframeUrl(hls, liveInputId).includes(videoUid), false);
});

test('selectBroadcastRecordingVideo saves a dashboard-ready VOD when timing is loose', () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const vodUid = 'dashboard-ready-vod-uid-dashboard';
  const selected = selectBroadcastRecordingVideo(
    [
      {
        uid: liveInputId,
        duration: 12,
        created: '2026-09-18T10:00:00.000Z',
        status: { state: 'ready' },
        readyToStream: true,
      },
      {
        uid: vodUid,
        duration: 240,
        created: '2026-09-18T10:01:00.000Z',
        status: { state: 'ready' },
        readyToStream: true,
      },
    ],
    {
      liveStartedAt: '2026-09-18T10:00:00.000Z',
      liveEndedAt: '2026-09-18T12:00:00.000Z',
      liveInputId,
    },
  );
  assert.equal(selected.uid, vodUid);
  assert.equal(selected.ready, true);
  assert.notEqual(selected.uid, liveInputId);
});

test('empty video list retries Cloudflare video list then captures', async () => {
  const lists = [];
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: 'live-input-uid-new',
    cfStreamVideoUid: '',
    liveStartedAt: '2026-09-09T12:00:00.000Z',
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async () => {
      lists.push(1);
      if (lists.length === 1) return [];
      return [
        {
          uid: 'after-ensure-uid',
          created: '2026-09-09T12:05:00.000Z',
          status: { state: 'ready' },
          readyToStream: true,
        },
      ];
    },
  });
  assert.equal(lists.length, 2);
  assert.equal(result.saved, true);
  assert.equal(event.cfStreamVideoUid, 'after-ensure-uid');
});

test('hourly reconcile saves a ready VOD UID without a watch-page poll', async () => {
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    status: 'ended',
    cfStreamLiveInputId: 'live-input-uid-new',
    cfStreamVideoUid: '',
    save: async () => event,
  };
  const result = await reconcileOfflineCloudflareRecordings({
    findEvents: async () => [event],
    captureCloudflareRecordedVideoUid: async (ev) => {
      ev.cfStreamVideoUid = 'hourly-uid';
      ev.cfStreamPendingVideoUid = '';
      return { saved: true, uid: 'hourly-uid' };
    },
  });
  assert.equal(result.saved, 1);
  assert.equal(event.cfStreamVideoUid, 'hourly-uid');
});

test('3-minute broadcast then stop: trailing 30s clip is not the VOD', async () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const fullUid = 'full-three-minute-vod-uid-full-th';
  const clipUid = 'trailing-thirty-sec-clip-uidxxxx';
  const liveStartedAt = '2026-09-09T12:00:00.000Z';
  const liveEndedAt = '2026-09-09T12:03:00.000Z';
  const livePlaceholder = {
    uid: liveInputId,
    created: liveStartedAt,
    duration: 32,
    status: { state: 'ready' },
    readyToStream: true,
  };
  const fullVod = {
    uid: fullUid,
    created: liveStartedAt,
    duration: 180,
    status: { state: 'ready' },
    readyToStream: true,
    playback: {
      hls: `https://customer-test.cloudflarestream.com/${fullUid}/manifest/video.m3u8`,
    },
  };
  const trailingClip = {
    uid: clipUid,
    created: '2026-09-09T12:03:30.000Z',
    duration: 30,
    status: { state: 'ready' },
    readyToStream: true,
  };

  const selected = selectBroadcastRecordingVideo(
    [livePlaceholder, trailingClip, fullVod],
    { liveStartedAt, liveEndedAt, liveInputId },
  );
  assert.equal(selected.uid, fullUid);
  assert.equal(selected.ready, true);
  assert.equal(selected.durationSec, 180);

  const event = {
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    isLive: false,
    status: 'ended',
    liveStartedAt,
    liveEndedAt,
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: '',
  };
  const processingFirst = await captureCloudflareRecordedVideoUid(
    { ...event },
    {
      listLiveInputVideos: async () => [
        livePlaceholder,
        trailingClip,
        {
          ...fullVod,
          status: { state: 'inprogress' },
          readyToStream: false,
          duration: 0,
        },
      ],
    },
  );
  assert.equal(processingFirst.saved, false);
  assert.equal(processingFirst.reason, 'processing');
  assert.equal(processingFirst.uid, fullUid);

  const savedEvent = { ...event };
  const ready = await captureCloudflareRecordedVideoUid(savedEvent, {
    listLiveInputVideos: async () => [livePlaceholder, trailingClip, fullVod],
  });
  assert.equal(ready.saved, true);
  assert.equal(ready.uid, fullUid);
  assert.equal(savedEvent.cfStreamVideoUid, fullUid);
  assert.equal(savedEvent.cfStreamVideoDurationSec, 180);
  assert.equal(
    savedEvent.cfStreamPlaybackHlsUrl,
    `https://customer-test.cloudflarestream.com/${fullUid}/manifest/video.m3u8`,
  );
  assert.notEqual(savedEvent.cfStreamVideoUid, liveInputId);
  assert.notEqual(savedEvent.cfStreamVideoUid, clipUid);

  const vodUrl = `https://customer-test.cloudflarestream.com/${fullUid}/manifest/video.m3u8`;
  const fields = publicCloudflareOfflinePlayback(savedEvent, { isLive: false });
  assert.equal(fields.playbackMode, 'recorded');
  assert.equal(fields.hlsUrl, vodUrl);
  assert.equal(fields.playbackUrl, vodUrl);
  assert.equal(fields.hlsUrl.includes(liveInputId), false);
  assert.equal(String(fields.hlsUrl).includes('dvrEnabled'), false);
  assert.equal(buildCloudflareRecordedHlsUrl(CF_HLS, liveInputId, liveInputId), '');

  const stalePrevious = publicCloudflareOfflinePlayback(
    {
      ...savedEvent,
      liveStartedAt: '2026-09-09T13:00:00.000Z',
      liveEndedAt: '2026-09-09T13:03:00.000Z',
      cfStreamVideoUid: 'old-broadcast-uid-old-broadcast-u',
      cfStreamVideoCapturedAt: '2026-09-09T12:05:00.000Z',
      cfStreamVideoDurationSec: 180,
    },
    { isLive: false },
  );
  assert.equal(stalePrevious.playbackMode, 'offline');
  assert.equal(stalePrevious.cfRecordingPreparing, true);

  const shortSaved = publicCloudflareOfflinePlayback(
    {
      ...event,
      cfStreamVideoUid: clipUid,
      cfStreamVideoDurationSec: 30,
    },
    { isLive: false },
  );
  assert.equal(shortSaved.playbackMode, 'offline');
  assert.equal(shortSaved.cfRecordingPreparing, true);
});

test('Live Input UID is never persisted or served as the offline VOD UID', async () => {
  const liveInputId = 'd0e9aac6ba383336f6f554943a995628';
  const vodUid = '012fb1fb3c04ced343acde6477ee800e';
  assert.equal(isCloudflareLiveInputVideoUid(liveInputId, liveInputId), true);
  assert.equal(isCloudflareLiveInputVideoUid(vodUid, liveInputId), false);
  assert.equal(buildCloudflareRecordedHlsUrl(CF_HLS, liveInputId, liveInputId), '');

  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    liveStartedAt: '2026-09-09T15:24:46.493Z',
    liveEndedAt: '2026-09-09T15:27:46.493Z',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: `https://customer-test.cloudflarestream.com/${liveInputId}/manifest/video.m3u8`,
    cfStreamVideoUid: '',
  };
  const result = await captureCloudflareRecordedVideoUid(event, {
    listLiveInputVideos: async () => [
      {
        uid: liveInputId,
        created: event.liveStartedAt,
        duration: 32,
        status: { state: 'ready' },
        readyToStream: true,
      },
      {
        uid: vodUid,
        created: event.liveStartedAt,
        duration: 190,
        status: { state: 'ready' },
        readyToStream: true,
        playback: {
          hls: `https://customer-test.cloudflarestream.com/${vodUid}/manifest/video.m3u8`,
        },
      },
    ],
  });
  assert.equal(result.saved, true);
  assert.equal(result.uid, vodUid);
  assert.notEqual(event.cfStreamVideoUid, liveInputId);
  const fields = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(fields.playbackMode, 'recorded');
  assert.equal(fields.hlsUrl.includes(liveInputId), false);
  assert.equal(String(fields.hlsUrl).includes('dvrEnabled'), false);
  assert.equal(fields.cfStreamVideoUid, vodUid);
  assert.equal(fields.durationSec, 190);
});

test('processing VOD is retried instead of serving a short ready clip', async () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const fullUid = 'full-session-vod-still-processingxx';
  const clipUid = 'ready-trailing-thirty-sec-clipxxx';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    liveStartedAt: '2026-09-09T12:00:00.000Z',
    liveEndedAt: '2026-09-09T12:03:00.000Z',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: CF_HLS,
    cfStreamVideoUid: '',
  };
  const first = await captureCloudflareRecordedVideoUid(
    { ...event },
    {
      listLiveInputVideos: async () => [
        {
          uid: clipUid,
          created: '2026-09-09T12:02:40.000Z',
          duration: 30,
          status: { state: 'ready' },
          readyToStream: true,
        },
        {
          uid: fullUid,
          created: event.liveStartedAt,
          duration: 0,
          status: { state: 'inprogress' },
          readyToStream: false,
        },
      ],
    },
  );
  assert.equal(first.saved, false);
  assert.equal(first.reason, 'processing');
  assert.equal(first.uid, fullUid);

  const saved = { ...event, cfStreamPendingVideoUid: fullUid };
  const second = await captureCloudflareRecordedVideoUid(saved, {
    listLiveInputVideos: async () => [
      {
        uid: clipUid,
        created: '2026-09-09T12:02:40.000Z',
        duration: 30,
        status: { state: 'ready' },
        readyToStream: true,
      },
      {
        uid: fullUid,
        created: event.liveStartedAt,
        duration: 180,
        status: { state: 'ready' },
        readyToStream: true,
      },
    ],
  });
  assert.equal(second.saved, true);
  assert.equal(saved.cfStreamVideoUid, fullUid);
  assert.equal(saved.cfStreamPendingVideoUid, '');
});

test('refresh uses the persisted VOD UID and official playback.hls', () => {
  const liveInputId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const videoUid = 'persisted-three-minute-vod-uidxxxx';
  const official =
    `https://customer-test.cloudflarestream.com/${videoUid}/manifest/video.m3u8`;
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    status: 'ended',
    liveStartedAt: '2026-09-09T12:00:00.000Z',
    liveEndedAt: '2026-09-09T12:03:00.000Z',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: `${CF_HLS}?dvrEnabled=true`,
    cfStreamVideoUid: videoUid,
    cfStreamVideoDurationSec: 180,
    cfStreamPlaybackHlsUrl: official,
    cfStreamVideoCapturedAt: '2026-09-09T12:04:00.000Z',
  };
  const first = publicCloudflareOfflinePlayback(event, { isLive: false });
  const refreshed = publicCloudflareOfflinePlayback({ ...event }, { isLive: false });
  assert.equal(first.hlsUrl, official);
  assert.equal(refreshed.hlsUrl, first.hlsUrl);
  assert.equal(refreshed.cfStreamVideoUid, videoUid);
  assert.equal(resolveCloudflareRecordedPlaybackUrl(event), official);
  assert.equal(classifyCloudflareHlsManifest('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n1.m3u8').type, 'master');
  assert.equal(
    classifyCloudflareHlsManifest('#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:2,\nseg.ts\n#EXT-X-ENDLIST').type,
    'vod',
  );
  assert.equal(classifyCloudflareHlsManifest('#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:2,\nseg.ts').finite, false);
});

test('5-minute Cloudflare live then offline persists the ~5-minute session VOD', async () => {
  const liveInputId = 'd0e9aac6ba383336f6f554943a995628';
  const fiveMinUid = 'aa56098453fdf44646f9d132ea1ec1eb';
  const clipUid = 'ten-second-trailing-clip-uidxxxxx';
  const olderUid = 'e54e8acf1d99bb428f39f118f5aa6c30';
  const liveStartedAt = '2026-09-09T16:14:21.000Z';
  const liveEndedAt = '2026-09-09T16:20:08.000Z';
  const staleFirstStart = '2026-09-09T15:24:46.493Z';
  const fiveMinVod = {
    uid: fiveMinUid,
    created: liveStartedAt,
    duration: 310,
    status: { state: 'ready' },
    readyToStream: true,
    playback: {
      hls: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${fiveMinUid}/manifest/video.m3u8`,
    },
  };
  const trailing = {
    uid: clipUid,
    created: liveEndedAt,
    duration: 10,
    status: { state: 'ready' },
    readyToStream: true,
  };
  const older = {
    uid: olderUid,
    created: '2026-09-09T15:39:46.000Z',
    duration: 207.83,
    status: { state: 'ready' },
    readyToStream: true,
  };
  const livePlaceholder = {
    uid: liveInputId,
    created: liveStartedAt,
    duration: 12,
    status: { state: 'ready' },
    readyToStream: true,
  };

  const processing = selectBroadcastRecordingVideo(
    [
      livePlaceholder,
      older,
      {
        ...fiveMinVod,
        duration: -1,
        status: { state: 'live-inprogress' },
        readyToStream: false,
      },
    ],
    { liveStartedAt: staleFirstStart, liveEndedAt, liveInputId },
  );
  assert.equal(processing.uid, fiveMinUid);
  assert.equal(processing.ready, false);

  const both = selectBroadcastRecordingVideo(
    [livePlaceholder, older, trailing, fiveMinVod],
    { liveStartedAt: staleFirstStart, liveEndedAt, liveInputId },
  );
  assert.equal(both.uid, fiveMinUid);
  assert.equal(both.ready, true);
  assert.equal(both.durationSec, 310);
  assert.notEqual(both.uid, liveInputId);
  assert.notEqual(both.uid, clipUid);
  assert.notEqual(both.uid, olderUid);

  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    liveStartedAt: staleFirstStart,
    liveEndedAt,
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: `https://customer-test.cloudflarestream.com/${liveInputId}/manifest/video.m3u8?dvrEnabled=true`,
    cfStreamVideoUid: '',
  };
  const saved = await captureCloudflareRecordedVideoUid(
    { ...event },
    { listLiveInputVideos: async () => [livePlaceholder, older, trailing, fiveMinVod] },
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.uid, fiveMinUid);
  assert.equal(saved.durationSec, 310);

  const persisted = {
    ...event,
    cfStreamVideoUid: fiveMinUid,
    cfStreamVideoDurationSec: 310,
    cfStreamPlaybackHlsUrl: fiveMinVod.playback.hls,
    cfStreamVideoCapturedAt: liveEndedAt,
  };
  const first = publicCloudflareOfflinePlayback(persisted, { isLive: false });
  const refreshed = publicCloudflareOfflinePlayback({ ...persisted }, { isLive: false });
  assert.equal(first.playbackMode, 'recorded');
  assert.equal(first.hlsUrl, fiveMinVod.playback.hls);
  assert.equal(first.playbackUrl, fiveMinVod.playback.hls);
  assert.equal(String(first.hlsUrl).includes('dvrEnabled'), false);
  assert.equal(first.hlsUrl.includes(liveInputId), false);
  assert.equal(first.cfStreamVideoUid, fiveMinUid);
  assert.equal(first.durationSec, 310);
  assert.equal(refreshed.hlsUrl, first.hlsUrl);
  assert.equal(refreshed.cfStreamVideoUid, fiveMinUid);

  const noUid = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(noUid.playbackMode, 'offline');
  assert.equal(noUid.hlsUrl, '');
  assert.equal(noUid.playbackUrl, '');
  assert.equal(String(noUid.playbackUrl || '').includes(liveInputId), false);
  assert.equal(String(noUid.hlsUrl || '').includes('dvrEnabled'), false);
});

test('OBS stop → preparing (no DVR) → processing VOD → persist ready UID → refresh', async () => {
  const liveInputId = 'd0e9aac6ba383336f6f554943a995628';
  const fiveMinUid = 'aa56098453fdf44646f9d132ea1ec1eb';
  const oldUid = 'e54e8acf1d99bb428f39f118f5aa6c30';
  const clipUid = 'ten-second-trailing-clip-uidxxxxx';
  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    status: 'ended',
    liveStartedAt: '2026-09-09T16:14:21.000Z',
    liveEndedAt: '2026-09-09T16:20:08.000Z',
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: `https://customer-test.cloudflarestream.com/${liveInputId}/manifest/video.m3u8?dvrEnabled=true`,
    cfStreamVideoUid: '',
  };

  const preparing = publicCloudflareOfflinePlayback(event, { isLive: false });
  assert.equal(preparing.playbackMode, 'offline');
  assert.equal(preparing.cfRecordingPreparing, true);
  assert.equal(preparing.hlsUrl, '');
  assert.equal(preparing.playbackUrl, '');
  assert.equal(String(preparing.hlsUrl).includes('dvrEnabled'), false);
  assert.equal(String(preparing.playbackUrl).includes(liveInputId), false);

  const processing = await captureCloudflareRecordedVideoUid(
    { ...event },
    {
      listLiveInputVideos: async () => [
        {
          uid: oldUid,
          created: '2026-09-09T15:39:46.000Z',
          duration: 207,
          status: { state: 'ready' },
          readyToStream: true,
        },
        {
          uid: liveInputId,
          created: '2026-09-09T16:14:21.000Z',
          duration: 12,
          status: { state: 'ready' },
          readyToStream: true,
        },
        {
          uid: fiveMinUid,
          created: '2026-09-09T16:14:21.000Z',
          duration: -1,
          status: { state: 'live-inprogress' },
          readyToStream: false,
        },
      ],
    },
  );
  assert.equal(processing.saved, false);
  assert.equal(processing.reason, 'processing');
  assert.equal(processing.uid, fiveMinUid);
  assert.notEqual(processing.uid, liveInputId);

  const readyEvent = { ...event };
  const ready = await captureCloudflareRecordedVideoUid(readyEvent, {
    listLiveInputVideos: async () => [
      {
        uid: oldUid,
        created: '2026-09-09T15:39:46.000Z',
        duration: 207,
        status: { state: 'ready' },
        readyToStream: true,
      },
      {
        uid: clipUid,
        created: '2026-09-09T16:20:20.000Z',
        duration: 10,
        status: { state: 'ready' },
        readyToStream: true,
      },
      {
        uid: fiveMinUid,
        created: '2026-09-09T16:14:21.000Z',
        duration: 310,
        status: { state: 'ready' },
        readyToStream: true,
        playback: {
          hls: `https://customer-test.cloudflarestream.com/${fiveMinUid}/manifest/video.m3u8`,
        },
      },
    ],
  });
  assert.equal(ready.saved, true);
  assert.equal(readyEvent.cfStreamVideoUid, fiveMinUid);
  assert.notEqual(readyEvent.cfStreamVideoUid, liveInputId);
  assert.notEqual(readyEvent.cfStreamVideoUid, oldUid);
  assert.notEqual(readyEvent.cfStreamVideoUid, clipUid);
  assert.equal(readyEvent.cfStreamVideoDurationSec, 310);
  assert.equal(
    readyEvent.cfStreamPlaybackHlsUrl,
    `https://customer-test.cloudflarestream.com/${fiveMinUid}/manifest/video.m3u8`,
  );

  const playable = publicCloudflareOfflinePlayback(readyEvent, { isLive: false });
  const refreshed = publicCloudflareOfflinePlayback({ ...readyEvent }, { isLive: false });
  assert.equal(playable.playbackMode, 'recorded');
  assert.equal(playable.cfRecordingPreparing, false);
  assert.equal(playable.cfStreamVideoUid, fiveMinUid);
  assert.equal(String(playable.hlsUrl).includes('dvrEnabled'), false);
  assert.equal(playable.hlsUrl.includes(liveInputId), false);
  assert.equal(refreshed.hlsUrl, playable.hlsUrl);
  assert.equal(refreshed.cfStreamVideoUid, fiveMinUid);
});

test('actual Cloudflare READY 3m55s and 5m44s: persist just-ended session, not previous test', async () => {
  const liveInputId = 'd0e9aac6ba383336f6f554943a995628';
  const latestUid = '4ecf811574eabb5e44cd3504f952acfe';
  const fiveMinUid = 'aa56098453fdf44646f9d132ea1ec1eb';
  const videos = [
    {
      uid: latestUid,
      duration: 235.43,
      created: '2026-09-09T16:36:33.946018Z',
      modified: '2026-09-09T16:41:12.616728Z',
      status: { state: 'ready' },
      readyToStream: true,
      liveInput: liveInputId,
      playback: {
        hls: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${latestUid}/manifest/video.m3u8`,
      },
    },
    {
      uid: fiveMinUid,
      duration: 344.07,
      created: '2026-09-09T16:14:21.093497Z',
      modified: '2026-09-09T16:32:20.8522Z',
      status: { state: 'ready' },
      readyToStream: true,
      liveInput: liveInputId,
      playback: {
        hls: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${fiveMinUid}/manifest/video.m3u8`,
      },
    },
    {
      uid: '865aac5348a7ced20adefdcc607d4ce8',
      duration: 95.5,
      created: '2026-09-09T15:44:16.397714Z',
      modified: '2026-09-09T15:52:20.077425Z',
      status: { state: 'ready' },
      readyToStream: true,
      liveInput: liveInputId,
    },
    {
      uid: 'e54e8acf1d99bb428f39f118f5aa6c30',
      duration: 207.83,
      created: '2026-09-09T15:39:46.467586Z',
      modified: '2026-09-09T15:43:31.192199Z',
      status: { state: 'ready' },
      readyToStream: true,
      liveInput: liveInputId,
    },
    {
      uid: '012fb1fb3c04ced343acde6477ee800e',
      duration: 190,
      created: '2026-09-09T15:24:32.11746Z',
      modified: '2026-09-09T15:32:20.164089Z',
      status: { state: 'ready' },
      readyToStream: true,
      liveInput: liveInputId,
    },
    {
      uid: liveInputId,
      duration: 12,
      created: '2026-09-09T16:36:33.946018Z',
      status: { state: 'ready' },
      readyToStream: true,
      playback: {
        hls: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${liveInputId}/manifest/video.m3u8?dvrEnabled=true`,
      },
    },
  ];

  const staleStart = '2026-09-09T15:24:46.493Z';
  const latestEnd = '2026-09-09T16:41:23.701Z';
  const latest = selectBroadcastRecordingVideo(videos, {
    liveStartedAt: staleStart,
    liveEndedAt: latestEnd,
    liveInputId,
  });
  assert.equal(latest.uid, latestUid);
  assert.equal(latest.ready, true);
  assert.notEqual(latest.uid, fiveMinUid);
  assert.notEqual(latest.uid, liveInputId);

  const fiveMinEnd = selectBroadcastRecordingVideo(videos, {
    liveStartedAt: staleStart,
    liveEndedAt: '2026-09-09T16:20:08.392Z',
    liveInputId,
  });
  assert.equal(fiveMinEnd.uid, fiveMinUid);
  assert.equal(fiveMinEnd.ready, true);
  assert.notEqual(fiveMinEnd.uid, latestUid);

  const leftoverInProgress = selectBroadcastRecordingVideo(
    [
      ...videos,
      {
        uid: 'leftover-live-inprogress-uidxxxxxx',
        duration: -1,
        created: '2026-09-09T16:41:40.000Z',
        status: { state: 'live-inprogress' },
        readyToStream: false,
      },
    ],
    { liveStartedAt: staleStart, liveEndedAt: latestEnd, liveInputId },
  );
  assert.equal(leftoverInProgress.uid, latestUid);
  assert.equal(leftoverInProgress.ready, true);

  const event = {
    liveIngestProvider: 'cloudflare_stream',
    isLive: false,
    status: 'ended',
    liveStartedAt: staleStart,
    liveEndedAt: latestEnd,
    cfStreamLiveInputId: liveInputId,
    cfStreamHlsUrl: `https://customer-abhs0ar9htahlgra.cloudflarestream.com/${liveInputId}/manifest/video.m3u8?dvrEnabled=true`,
    cfStreamVideoUid: '',
  };
  const saved = await captureCloudflareRecordedVideoUid(
    { ...event },
    { listLiveInputVideos: async () => videos },
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.uid, latestUid);
  assert.equal(saved.durationSec, 235.43);

  const persisted = {
    ...event,
    cfStreamVideoUid: latestUid,
    cfStreamVideoDurationSec: 235.43,
    cfStreamPlaybackHlsUrl: videos[0].playback.hls,
    cfStreamVideoCapturedAt: latestEnd,
  };
  const playable = publicCloudflareOfflinePlayback(persisted, { isLive: false });
  const refreshed = publicCloudflareOfflinePlayback({ ...persisted }, { isLive: false });
  assert.equal(playable.playbackMode, 'recorded');
  assert.equal(playable.cfStreamVideoUid, latestUid);
  assert.equal(playable.hlsUrl, videos[0].playback.hls);
  assert.equal(String(playable.hlsUrl).includes('dvrEnabled'), false);
  assert.equal(playable.hlsUrl.includes(liveInputId), false);
  assert.equal(refreshed.hlsUrl, playable.hlsUrl);
  assert.equal(refreshed.cfStreamVideoUid, latestUid);
});

