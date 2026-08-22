import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventHasYoutubeBroadcast,
  runWeddingCardYoutubeProvision,
  shouldRetryYoutubeProvision,
  weddingCardDuplicateFilter,
  weddingCardFingerprint,
  weddingCardLiveStatus,
} from './weddingCardProvision.js';

test('fingerprint is stable for the same couple, date, and organizer', () => {
  const a = weddingCardFingerprint({
    organizerId: 'user1',
    groomName: 'Sai Kumar Reddy',
    brideName: 'Pranathi Reddy',
    weddingDate: '2026-08-30',
  });
  const b = weddingCardFingerprint({
    organizerId: 'user1',
    groomName: 'Sai Kumar Reddy',
    brideName: 'Pranathi Reddy',
    weddingDate: '2026-08-30',
  });
  const c = weddingCardFingerprint({
    organizerId: 'user1',
    groomName: 'Someone Else',
    brideName: 'Pranathi Reddy',
    weddingDate: '2026-08-30',
  });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 40);
});

test('duplicate filter scopes by organizer, source, and fingerprint', () => {
  const filter = weddingCardDuplicateFilter('abc', 'fp123');
  assert.deepEqual(filter, {
    organizer: 'abc',
    source: 'wedding-card',
    weddingCardFingerprint: 'fp123',
  });
});

test('eventHasYoutubeBroadcast is true when a video id exists', () => {
  assert.equal(eventHasYoutubeBroadcast({ youtubeVideoId: '882LagGGVM4' }), true);
  assert.equal(eventHasYoutubeBroadcast({ youtubeWatchUrl: 'https://youtu.be/882LagGGVM4' }), true);
  assert.equal(eventHasYoutubeBroadcast({ title: 'Sai Kumar Reddy Weds Pranathi Reddy' }), false);
});

test('shouldRetryYoutubeProvision never auto-retries (status poll is DB-only)', () => {
  assert.equal(
    shouldRetryYoutubeProvision({
      youtubeVideoId: '882LagGGVM4',
      youtubeProvisionStatus: 'pending',
    }),
    false
  );
  assert.equal(
    shouldRetryYoutubeProvision({
      youtubeVideoId: '',
      youtubeProvisionStatus: 'pending',
    }),
    false
  );
  assert.equal(
    shouldRetryYoutubeProvision({
      youtubeVideoId: '',
      youtubeProvisionStatus: 'failed',
    }),
    false
  );
});

test('YouTube provisioning failure keeps extracted details and does not throw', async () => {
  const event = {
    _id: 'evt1',
    title: 'Sai Kumar Reddy Weds Pranathi Reddy',
    youtubeVideoId: '',
  };
  const { ingest, error } = await runWeddingCardYoutubeProvision(
    { _id: 'user1' },
    event,
    {
      provisionFn: async () => {
        const err = new Error('youtube down');
        err.statusCode = 502;
        throw err;
      },
    }
  );
  assert.equal(ingest, null);
  assert.ok(error);
  assert.equal(event.title, 'Sai Kumar Reddy Weds Pranathi Reddy');
  assert.equal(event.youtubeProvisionStatus, 'failed');
  const status = weddingCardLiveStatus(event, { error });
  assert.equal(status.status, 'failed');
  assert.match(status.message, /YouTube Live creation failed/i);
  assert.match(status.reason, /youtube down/i);
});

test('provisioning is skipped when a YouTube broadcast already exists', async () => {
  let called = 0;
  const event = { _id: 'evt2', youtubeVideoId: '882LagGGVM4' };
  const { ingest } = await runWeddingCardYoutubeProvision(
    { _id: 'user1' },
    event,
    {
      provisionFn: async () => {
        called += 1;
        throw new Error('should not create another broadcast');
      },
    }
  );
  assert.equal(called, 0);
  assert.equal(ingest, null);
  assert.equal(event.youtubeProvisionStatus, 'ready');
});

test('in-flight wedding provision does not start a second YouTube create', async () => {
  let started = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const event = { _id: 'evt-lock', youtubeVideoId: '' };
  const first = runWeddingCardYoutubeProvision(
    { _id: 'user1' },
    event,
    {
      provisionFn: async () => {
        started += 1;
        await gate;
        return {
          watchUrl: 'https://www.youtube.com/watch?v=882LagGGVM4',
          broadcastId: '882LagGGVM4',
          streamId: 'stream1',
          rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: 'key',
        };
      },
    }
  );
  await new Promise((resolve) => setImmediate(resolve));
  const second = await runWeddingCardYoutubeProvision(
    { _id: 'user1' },
    { _id: 'evt-lock', youtubeVideoId: '' },
    {
      provisionFn: async () => {
        started += 1;
        return null;
      },
    }
  );
  assert.equal(second.ingest, null);
  assert.equal(started, 1);
  release();
  await first;
  assert.equal(started, 1);
});
