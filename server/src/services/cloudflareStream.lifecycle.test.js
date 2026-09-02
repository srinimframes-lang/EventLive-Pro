import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-cf-lifecycle-unit';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-cloudflare-stream-token';

const ANIL_INPUT = 'f175154f728840ce4408e98c13c24302';
const OTHER_INPUT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const {
  PROTECTED_CF_LIVE_INPUT_IDS,
  shouldDeleteCloudflareLiveInputForEvent,
  deleteCloudflareLiveInputForEvent,
  syncCloudflareSimulcastOutputs,
} = await import('../services/cloudflareStream.js');

test('PROTECTED_CF_LIVE_INPUT_IDS includes Anil Geetha pilot input', () => {
  assert.equal(PROTECTED_CF_LIVE_INPUT_IDS.has(ANIL_INPUT), true);
});

test('shouldDeleteCloudflareLiveInputForEvent rejects protected and shared inputs', () => {
  const protectedEvent = {
    _id: '6a927f90ff163d32dba6654d',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: ANIL_INPUT,
  };
  assert.equal(shouldDeleteCloudflareLiveInputForEvent(protectedEvent), false);

  const sharedEvent = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: OTHER_INPUT,
  };
  assert.equal(
    shouldDeleteCloudflareLiveInputForEvent(sharedEvent, { otherEventsUsingInput: 1 }),
    false,
  );

  const ownedEvent = {
    _id: 'cccccccccccccccccccccccc',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: OTHER_INPUT,
  };
  assert.equal(
    shouldDeleteCloudflareLiveInputForEvent(ownedEvent, { otherEventsUsingInput: 0 }),
    true,
  );

  assert.equal(
    shouldDeleteCloudflareLiveInputForEvent({ liveIngestProvider: 'mediamtx' }),
    false,
  );
});

test('deleteCloudflareLiveInputForEvent never deletes protected Anil Geetha input', async () => {
  let deleteCalled = false;
  const result = await deleteCloudflareLiveInputForEvent(
    {
      _id: '6a927f90ff163d32dba6654d',
      liveIngestProvider: 'cloudflare_stream',
      cfStreamLiveInputId: ANIL_INPUT,
    },
    {
      EventModel: { countDocuments: async () => 0 },
      deleteLiveInput: async () => {
        deleteCalled = true;
        return true;
      },
    },
  );
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'protected_live_input');
  assert.equal(deleteCalled, false);
});

test('deleteCloudflareLiveInputForEvent deletes dedicated non-protected inputs', async () => {
  const deleted = [];
  const result = await deleteCloudflareLiveInputForEvent(
    {
      _id: 'dddddddddddddddddddddddd',
      liveIngestProvider: 'cloudflare_stream',
      cfStreamLiveInputId: OTHER_INPUT,
    },
    {
      EventModel: { countDocuments: async () => 0 },
      deleteLiveInput: async (uid) => {
        deleted.push(uid);
        return true;
      },
    },
  );
  assert.equal(result.deleted, true);
  assert.deepEqual(deleted, [OTHER_INPUT]);
});

test('deleteCloudflareLiveInputForEvent skips when another event shares the input', async () => {
  let deleteCalled = false;
  const result = await deleteCloudflareLiveInputForEvent(
    {
      _id: 'eeeeeeeeeeeeeeeeeeeeeeee',
      liveIngestProvider: 'cloudflare_stream',
      cfStreamLiveInputId: OTHER_INPUT,
    },
    {
      EventModel: { countDocuments: async () => 2 },
      deleteLiveInput: async () => {
        deleteCalled = true;
        return true;
      },
    },
  );
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'shared_live_input');
  assert.equal(deleteCalled, false);
});

test('syncCloudflareSimulcastOutputs skips MediaMTX-only events', async () => {
  let listCalled = false;
  const result = await syncCloudflareSimulcastOutputs(
    { liveIngestProvider: 'mediamtx', streamProvider: 'rtmp' },
    {
      listLiveInputOutputs: async () => {
        listCalled = true;
        return [];
      },
    },
  );
  assert.equal(result.synced, false);
  assert.equal(listCalled, false);
});

test('syncCloudflareSimulcastOutputs creates YouTube output for Cloudflare events', async () => {
  const created = [];
  const result = await syncCloudflareSimulcastOutputs(
    {
      _id: 'ffffffffffffffffffffffff',
      liveIngestProvider: 'cloudflare_stream',
      cfStreamLiveInputId: OTHER_INPUT,
      youtubeForwardEnabled: true,
      youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      youtubeStreamKey: 'yt-key-123456',
      facebookForwardEnabled: false,
    },
    {
      listLiveInputOutputs: async () => [],
      createLiveInputOutput: async (_uid, spec) => {
        created.push(spec);
        return { uid: 'out-yt-1' };
      },
      deleteLiveInputOutput: async () => true,
    },
  );
  assert.equal(result.synced, true);
  assert.equal(created.length, 1);
  assert.match(created[0].url, /youtube\.com/);
  assert.equal(created[0].streamKey, 'yt-key-123456');
  assert.equal(JSON.stringify(created).includes('yt-key-123456'), true);
});
