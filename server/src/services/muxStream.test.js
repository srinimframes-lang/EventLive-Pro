import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-mux-stream-unit';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.MUX_TOKEN_ID = 'mux-token-id';
process.env.MUX_TOKEN_SECRET = 'mux-token-secret';

const {
  MuxStreamError,
  shouldProvisionMuxLive,
  liveStreamPassthrough,
  mapLiveStreamResult,
  applyMuxLiveStreamFields,
  createLiveStream,
  createEventWithMuxLive,
  getMuxConfig,
  muxHlsUrl,
  muxPlayerUrl,
  publicMuxPlayback,
  muxPublishingFromStatus,
  MUX_RTMPS_INGEST_URL,
} = await import('./muxStream.js');

const LIVE_STREAM_ID = 'ZEBrNTpHC02iUah025KM3te6ylM7W4S4silsrFtUkn3Ag';
const PLAYBACK_ID = 'HNRDuwff3K2VjTZZAPuvd2Kx6D01XUQFv02GFBHPUka018';
const STREAM_KEY = 'mux-super-secret-stream-key';

function muxApiLiveStream(overrides = {}) {
  return {
    id: LIVE_STREAM_ID,
    stream_key: STREAM_KEY,
    status: 'idle',
    playback_ids: [{ policy: 'public', id: PLAYBACK_ID }],
    recent_asset_ids: [],
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('shouldProvisionMuxLive only for mux events without a live stream id', () => {
  assert.equal(shouldProvisionMuxLive({ streamingProvider: 'mux' }), true);
  assert.equal(
    shouldProvisionMuxLive({ streamingProvider: 'mux', muxLiveStreamId: LIVE_STREAM_ID }),
    false,
  );
  assert.equal(
    shouldProvisionMuxLive({ streamingProvider: 'cloudflare_stream' }),
    false,
  );
  assert.equal(shouldProvisionMuxLive({ streamingProvider: 'external_embed' }), false);
});

test('liveStreamPassthrough is unique per event id', () => {
  const a = liveStreamPassthrough({ eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'one' });
  const b = liveStreamPassthrough({ eventId: 'bbbbbbbbbbbbbbbbbbbbbbbb', slug: 'one' });
  assert.match(a, /aaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.notEqual(a, b);
});

test('mapLiveStreamResult stores Mux fields and never includes the key in errors', () => {
  const mapped = mapLiveStreamResult(muxApiLiveStream());
  assert.equal(mapped.liveStreamId, LIVE_STREAM_ID);
  assert.equal(mapped.playbackId, PLAYBACK_ID);
  assert.equal(mapped.streamKey, STREAM_KEY);
  assert.equal(mapped.rtmpUrl, MUX_RTMPS_INGEST_URL);

  assert.throws(
    () => mapLiveStreamResult({ id: 'x', playback_ids: [{ id: PLAYBACK_ID, policy: 'public' }] }),
    (err) => {
      assert.equal(err.code, 'mux_live_stream_incomplete');
      assert.equal(String(err.message).includes(STREAM_KEY), false);
      return true;
    },
  );
});

test('applyMuxLiveStreamFields isolates Mux from Cloudflare leftover ingest', () => {
  const payload = {
    streamingProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    cfStreamLiveInputId: 'cf-uid',
    cfStreamHlsUrl: 'https://customer.cloudflarestream.com/x/manifest/video.m3u8',
    cfStreamRtmpsUrl: 'rtmps://live.cloudflare.com:443/live/',
    cfStreamRtmpsKey: 'cf-key',
  };
  applyMuxLiveStreamFields(payload, mapLiveStreamResult(muxApiLiveStream()));
  assert.equal(payload.streamingProvider, 'mux');
  assert.equal(payload.streamProvider, 'none');
  assert.equal(payload.muxLiveStreamId, LIVE_STREAM_ID);
  assert.equal(payload.muxPlaybackId, PLAYBACK_ID);
  assert.equal(payload.muxStreamKey, STREAM_KEY);
  assert.equal(payload.cfStreamLiveInputId, '');
  assert.equal(payload.cfStreamRtmpsKey, '');
});

test('createLiveStream posts one live stream and maps the result', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
    return jsonResponse({ data: muxApiLiveStream() });
  };
  const created = await createLiveStream(
    { eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'anil-geetha' },
    { fetchImpl, config: getMuxConfig() },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/live-streams$/);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body.playback_policies, ['public']);
  assert.deepEqual(calls[0].body.new_asset_settings.playback_policies, ['public']);
  assert.equal(created.liveStreamId, LIVE_STREAM_ID);
  assert.equal(created.playbackId, PLAYBACK_ID);
  assert.equal(created.streamKey, STREAM_KEY);
});

test('createEventWithMuxLive provisions exactly one live stream and rolls back on save failure', async () => {
  const created = [];
  const deleted = [];
  const createdEvent = await createEventWithMuxLive(
    { streamingProvider: 'mux', title: 'Mux Event', slug: 'mux-event' },
    {
      EventModel: {
        create: async (payload) => {
          assert.equal(payload.muxLiveStreamId, LIVE_STREAM_ID);
          assert.equal(payload.muxPlaybackId, PLAYBACK_ID);
          assert.equal(payload.muxStreamKey, STREAM_KEY);
          assert.equal(payload.muxRtmpUrl, MUX_RTMPS_INGEST_URL);
          return { ...payload, id: String(payload._id) };
        },
      },
      createLiveStream: async ({ eventId }) => {
        created.push(eventId);
        return mapLiveStreamResult(muxApiLiveStream());
      },
      deleteLiveStream: async (id) => {
        deleted.push(id);
      },
    },
  );
  assert.equal(created.length, 1);
  assert.equal(deleted.length, 0);
  assert.equal(createdEvent.muxLiveStreamId, LIVE_STREAM_ID);

  await assert.rejects(
    () =>
      createEventWithMuxLive(
        { streamingProvider: 'mux', title: 'Fail' },
        {
          EventModel: {
            create: async () => {
              throw new Error('db failed');
            },
          },
          createLiveStream: async () => mapLiveStreamResult(muxApiLiveStream()),
          deleteLiveStream: async (id) => {
            deleted.push(id);
          },
        },
      ),
    /db failed/,
  );
  assert.equal(deleted.includes(LIVE_STREAM_ID), true);
});

test('createEventWithMuxLive does not provision Cloudflare or MediaMTX events', async () => {
  let created = false;
  const event = await createEventWithMuxLive(
    { streamingProvider: 'cloudflare_stream', title: 'CF' },
    {
      EventModel: {
        create: async (payload) => payload,
      },
      createLiveStream: async () => {
        created = true;
        throw new MuxStreamError('should not run');
      },
    },
  );
  assert.equal(created, false);
  assert.equal(event.streamingProvider, 'cloudflare_stream');
});

test('publicMuxPlayback live vs recorded never uses Cloudflare URLs', () => {
  const live = publicMuxPlayback(
    {
      muxLiveStreamId: LIVE_STREAM_ID,
      muxPlaybackId: PLAYBACK_ID,
      muxAssetPlaybackId: 'vodPid',
      muxStatus: 'active',
      coverImage: 'https://cdn.example/poster.jpg',
    },
    { isPublishing: true },
  );
  assert.equal(live.playbackMode, 'live');
  assert.equal(live.isLive, true);
  assert.match(live.playbackUrl, /player\.mux\.com\//);
  assert.equal(live.hlsUrl, muxHlsUrl(PLAYBACK_ID));
  assert.equal(live.playbackUrl.includes('cloudflare'), false);

  const vod = publicMuxPlayback(
    {
      muxLiveStreamId: LIVE_STREAM_ID,
      muxPlaybackId: PLAYBACK_ID,
      muxAssetPlaybackId: 'vodPid',
      muxStatus: 'idle',
      status: 'published',
    },
    { isPublishing: false, isLive: false },
  );
  assert.equal(vod.playbackMode, 'recorded');
  assert.equal(vod.isLive, false);
  assert.match(vod.playbackUrl, /vodPid/);
  assert.match(muxPlayerUrl('vodPid', { mode: 'recorded' }), /stream-type=on-demand/);
});

test('muxPublishingFromStatus maps Mux live stream states', () => {
  assert.equal(muxPublishingFromStatus('active'), true);
  assert.equal(muxPublishingFromStatus('idle'), false);
  assert.equal(muxPublishingFromStatus('disconnected'), null);
});
