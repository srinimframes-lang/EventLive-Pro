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
  resetCloudflareOfflineFinalizationState,
  scheduleCloudflareRecordingUidRetry,
  isCloudflareRecordingUidRetryInflight,
  syncCloudflareLiveOfflineTransition,
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
  assert.equal(second.action, 'none');
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

test('protected Anil Geetha input is not auto-finalized', () => {
  assert.deepEqual(
    planCloudflareStreamConfigOffline(
      cfEvent({ cfStreamLiveInputId: ANIL_INPUT }),
      false,
    ),
    { action: 'none' },
  );
});

test('still-publishing Cloudflare event persists live instead of finalizing', () => {
  assert.deepEqual(planCloudflareStreamConfigOffline(cfEvent(), true), { action: 'persist_live' });
  assert.deepEqual(
    planCloudflareStreamConfigOffline(cfEvent({ isLive: false, status: 'ended' }), false),
    { action: 'none' },
  );
});
