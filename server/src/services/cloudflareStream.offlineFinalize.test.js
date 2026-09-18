import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-cf-offline-finalize-unit';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-cloudflare-stream-token';

const ANIL_INPUT = 'f175154f728840ce4408e98c13c24302';
const EVENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const {
  planCloudflareStreamConfigOffline,
  beginCloudflareOfflineFinalization,
  beginCloudflareLiveBroadcast,
  resetCloudflareOfflineFinalizationState,
  scheduleCloudflareRecordingUidRetry,
  isCloudflareRecordingUidRetryInflight,
  syncCloudflareLiveOfflineTransition,
  shouldReconcileCloudflareRecordingUid,
  reconcileOfflineCloudflareRecordings,
} = await import('../services/cloudflareStream.js');

function cfEvent(extra = {}) {
  return {
    id: EVENT_ID,
    _id: EVENT_ID,
    liveIngestProvider: 'cloudflare_stream',
    streamProvider: 'rtmp',
    status: 'live',
    isLive: true,
    cfStreamLiveInputId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    cfStreamVideoUid: '',
    save: async () => {},
    ...extra,
  };
}

function fakeTimers() {
  const queued = [];
  return {
    queued,
    setTimeoutFn: (fn, ms) => {
      queued.push({ fn, ms });
      return queued.length;
    },
    clearTimeoutFn: () => {},
  };
}

beforeEach(() => {
  resetCloudflareOfflineFinalizationState();
});

test('Cloudflare live → offline triggers finalization once', async () => {
  const event = cfEvent();
  assert.deepEqual(planCloudflareStreamConfigOffline(event, false), { action: 'finalize_once' });

  const finalized = [];
  const first = await syncCloudflareLiveOfflineTransition(event, false, {
    finalizeEventOffline: async (eventId) => {
      finalized.push(eventId);
      event.isLive = false;
      event.status = 'ended';
      event.cfStreamVideoUid = 'ready-uid';
      return event;
    },
    delaysMs: [10],
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  const second = await syncCloudflareLiveOfflineTransition(event, false, {
    finalizeEventOffline: async (eventId) => {
      finalized.push(eventId);
      return event;
    },
  });

  assert.equal(first.action, 'finalize_once');
  assert.equal(second.action, 'none');
  assert.deepEqual(finalized, [EVENT_ID]);
  assert.equal(event.cfStreamVideoUid, 'ready-uid');
});

test('concurrent live→offline polls skip duplicate finalization', async () => {
  const event = cfEvent();
  const finalized = [];
  const deps = {
    finalizeEventOffline: async () => {
      finalized.push(1);
      return event;
    },
  };
  const first = await syncCloudflareLiveOfflineTransition(event, false, deps);
  const second = await syncCloudflareLiveOfflineTransition(event, false, deps);
  assert.equal(first.action, 'finalize_once');
  assert.equal(second.action, 'skipped_duplicate');
  assert.equal(finalized.length, 1);
});

test('repeated offline polling does not trigger duplicate finalization/retry loops', async () => {
  const event = cfEvent();
  const timers = fakeTimers();
  const finalized = [];
  const captures = [];

  const deps = {
    finalizeEventOffline: async (eventId) => {
      finalized.push(eventId);
      event.isLive = false;
      event.status = 'ended';
      return event;
    },
    delaysMs: [15, 15],
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    EventModel: { findById: async () => event },
    captureCloudflareRecordedVideoUid: async () => {
      captures.push(1);
      return { saved: false, reason: 'no_completed_video' };
    },
  };

  const first = await syncCloudflareLiveOfflineTransition(event, false, deps);
  const second = await syncCloudflareLiveOfflineTransition(event, false, deps);
  const retryAgain = scheduleCloudflareRecordingUidRetry(EVENT_ID, deps);

  assert.equal(first.action, 'finalize_once');
  assert.ok(['skipped_duplicate', 'skipped_backoff', 'none'].includes(second.action));
  assert.equal(finalized.length, 1);
  assert.equal(timers.queued.length, 1);
  assert.equal(retryAgain.scheduled, false);
  assert.equal(retryAgain.reason, 'already_inflight');
  assert.equal(isCloudflareRecordingUidRetryInflight(EVENT_ID), true);
  assert.equal(captures.length, 0);
});

test('ready VOD UID gets saved', async () => {
  const event = cfEvent();
  const result = await syncCloudflareLiveOfflineTransition(event, false, {
    finalizeEventOffline: async () => {
      event.cfStreamVideoUid = 'vod-uid-1';
      event.isLive = false;
      event.status = 'ended';
      return event;
    },
    delaysMs: [10],
    setTimeoutFn: () => {
      throw new Error('retry must not start when UID already saved');
    },
    clearTimeoutFn: () => {},
  });
  assert.equal(result.action, 'finalize_once');
  assert.equal(event.cfStreamVideoUid, 'vod-uid-1');
  assert.equal(isCloudflareRecordingUidRetryInflight(EVENT_ID), false);
});

test('VOD not ready initially but becomes ready on retry', async () => {
  const event = cfEvent({ isLive: false, status: 'ended' });
  const timers = fakeTimers();
  let lists = 0;
  const saved = [];
  event.save = async () => {
    saved.push(event.cfStreamVideoUid);
  };

  const scheduled = scheduleCloudflareRecordingUidRetry(EVENT_ID, {
    delaysMs: [5, 5],
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    EventModel: { findById: async () => event },
    captureCloudflareRecordedVideoUid: async (ev) => {
      lists += 1;
      if (lists === 1) return { saved: false, reason: 'no_completed_video' };
      ev.cfStreamVideoUid = 'retry-ready-uid';
      return { saved: true, uid: 'retry-ready-uid' };
    },
  });

  assert.equal(scheduled.scheduled, true);
  assert.equal(timers.queued.length, 1);
  await timers.queued[0].fn();
  assert.equal(event.cfStreamVideoUid, '');
  assert.equal(timers.queued.length, 2);
  await timers.queued[1].fn();
  assert.equal(event.cfStreamVideoUid, 'retry-ready-uid');
  assert.deepEqual(saved, ['retry-ready-uid']);
  assert.equal(isCloudflareRecordingUidRetryInflight(EVENT_ID), false);
});

test('MediaMTX behavior unchanged', async () => {
  const event = {
    id: EVENT_ID,
    liveIngestProvider: 'mediamtx',
    streamProvider: 'rtmp',
    status: 'live',
    isLive: true,
    recordingUrl: '/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording',
  };
  assert.deepEqual(planCloudflareStreamConfigOffline(event, false), { action: 'none' });
  assert.equal(beginCloudflareOfflineFinalization(EVENT_ID), true);

  let finalized = false;
  const result = await syncCloudflareLiveOfflineTransition(event, false, {
    finalizeEventOffline: async () => {
      finalized = true;
      return event;
    },
  });
  assert.equal(result.action, 'none');
  assert.equal(finalized, false);
  assert.equal(event.recordingUrl, '/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording');
});

test('protected Anil Geetha input still finalizes and captures VOD UID', () => {
  assert.deepEqual(
    planCloudflareStreamConfigOffline(
      cfEvent({ cfStreamLiveInputId: ANIL_INPUT }),
      false,
    ),
    { action: 'finalize_once' },
  );
  assert.deepEqual(
    planCloudflareStreamConfigOffline(
      cfEvent({
        cfStreamLiveInputId: ANIL_INPUT,
        isLive: false,
        status: 'ended',
        cfStreamVideoUid: '',
      }),
      false,
    ),
    { action: 'reconcile_uid' },
  );
});

test('still-publishing Cloudflare event persists live instead of finalizing', () => {
  assert.deepEqual(planCloudflareStreamConfigOffline(cfEvent(), true), { action: 'persist_live' });
  assert.deepEqual(
    planCloudflareStreamConfigOffline(cfEvent({ isLive: false, status: 'ended' }), false),
    { action: 'reconcile_uid' },
  );
  assert.deepEqual(
    planCloudflareStreamConfigOffline(
      cfEvent({ isLive: false, status: 'ended', cfStreamVideoUid: 'already-saved' }),
      false,
    ),
    { action: 'none' },
  );
});

test('missed offline transition still captures the Video ID on a later GET /stream', async () => {
  const event = cfEvent({ isLive: false, status: 'ended', liveEndedAt: '2026-09-04T12:00:00.000Z' });
  const captures = [];
  const result = await syncCloudflareLiveOfflineTransition(event, false, {
    captureCloudflareRecordedVideoUid: async (ev) => {
      captures.push(1);
      ev.cfStreamVideoUid = 'reconciled-uid';
      return { saved: true, uid: 'reconciled-uid' };
    },
    setTimeoutFn: () => {
      throw new Error('retry must not start when reconcile already saved the UID');
    },
    clearTimeoutFn: () => {},
  });
  assert.equal(result.action, 'reconcile_uid');
  assert.equal(event.cfStreamVideoUid, 'reconciled-uid');
  assert.equal(captures.length, 1);
});

test('offline two days later still discovers a ready recording without finalizing live', async () => {
  const event = cfEvent({
    isLive: false,
    status: 'ended',
    liveEndedAt: '2026-09-04T10:00:00.000Z',
  });
  let finalized = false;
  const result = await syncCloudflareLiveOfflineTransition(event, false, {
    finalizeEventOffline: async () => {
      finalized = true;
      return event;
    },
    captureCloudflareRecordedVideoUid: async (ev) => {
      ev.cfStreamVideoUid = 'two-day-old-uid';
      return { saved: true, uid: 'two-day-old-uid' };
    },
  });
  assert.equal(result.action, 'reconcile_uid');
  assert.equal(finalized, false);
  assert.equal(event.cfStreamVideoUid, 'two-day-old-uid');
});

test('recording still processing retries until ready and does not list on every poll', async () => {
  const event = cfEvent({ isLive: false, status: 'ended' });
  const timers = fakeTimers();
  const captures = [];
  const deps = {
    now: 1_000,
    minIntervalMs: 30_000,
    delaysMs: [5, 5],
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    EventModel: { findById: async () => event },
    captureCloudflareRecordedVideoUid: async (ev) => {
      captures.push(1);
      if (captures.length < 3) return { saved: false, reason: 'processing', uid: 'pending-uid' };
      ev.cfStreamVideoUid = 'retry-ready-uid';
      return { saved: true, uid: 'retry-ready-uid' };
    },
  };

  const first = await syncCloudflareLiveOfflineTransition(event, false, deps);
  const second = await syncCloudflareLiveOfflineTransition(event, false, { ...deps, now: 2_000 });
  assert.equal(first.action, 'reconcile_uid');
  assert.equal(second.action, 'skipped_duplicate');
  assert.equal(captures.length, 1);
  assert.equal(shouldReconcileCloudflareRecordingUid(EVENT_ID, { now: 2_000, minIntervalMs: 30_000 }), false);

  await timers.queued[0].fn();
  await timers.queued[1].fn();
  assert.equal(event.cfStreamVideoUid, 'retry-ready-uid');
  assert.equal(captures.length, 3);

  const laterPoll = await syncCloudflareLiveOfflineTransition(event, false, { ...deps, now: 40_000 });
  assert.equal(laterPoll.action, 'none');
  assert.equal(captures.length, 3);
});

test('existing cfStreamVideoUid skips Cloudflare videos API', async () => {
  const event = cfEvent({
    isLive: false,
    status: 'ended',
    cfStreamVideoUid: 'already-there',
  });
  let listed = 0;
  const result = await syncCloudflareLiveOfflineTransition(event, false, {
    captureCloudflareRecordedVideoUid: async () => {
      listed += 1;
      return { saved: false, reason: 'should_not_run' };
    },
  });
  assert.equal(result.action, 'none');
  assert.equal(listed, 0);
});

test('next live broadcast persists live and allows a later finalize', async () => {
  const event = cfEvent({
    isLive: false,
    status: 'ended',
    cfStreamVideoUid: 'previous-vod',
  });
  const persisted = [];
  const live = await syncCloudflareLiveOfflineTransition(event, true, {
    persistCloudflareLive: async (ev) => {
      persisted.push(1);
      beginCloudflareLiveBroadcast(ev, { now: new Date('2026-09-09T18:00:00.000Z') });
      return ev;
    },
  });
  assert.equal(live.action, 'persist_live');
  assert.equal(persisted.length, 1);
  assert.equal(event.cfStreamVideoUid, '');
  assert.equal(event.isLive, true);
  assert.deepEqual(planCloudflareStreamConfigOffline(event, false), { action: 'finalize_once' });
});

test('unknown publishing status still reconciles a missed offline VOD', async () => {
  const event = cfEvent({ isLive: false, status: 'ended', cfStreamVideoUid: '' });
  const captures = [];
  const result = await syncCloudflareLiveOfflineTransition(event, null, {
    captureCloudflareRecordedVideoUid: async (ev) => {
      captures.push(1);
      ev.cfStreamVideoUid = 'null-probe-uid';
      return { saved: true, uid: 'null-probe-uid' };
    },
  });
  assert.equal(result.action, 'reconcile_uid');
  assert.equal(event.cfStreamVideoUid, 'null-probe-uid');
  assert.equal(captures.length, 1);
});

test('hourly reconcile recovers UID after in-memory retries are gone', async () => {
  const event = cfEvent({ isLive: false, status: 'ended', cfStreamVideoUid: '' });
  const result = await reconcileOfflineCloudflareRecordings({
    findEvents: async () => [event],
    captureCloudflareRecordedVideoUid: async (ev) => {
      ev.cfStreamVideoUid = 'durable-uid';
      return { saved: true, uid: 'durable-uid' };
    },
  });
  assert.equal(result.saved, 1);
  assert.equal(event.cfStreamVideoUid, 'durable-uid');
});
