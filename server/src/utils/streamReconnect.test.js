import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetReconnectTimersForTests,
  isWithinReconnectGrace,
  LIVE_RECONNECT_GRACE_MS,
  scheduleOfflineTimer,
  clearOfflineTimer,
} from './streamReconnect.js';

test('isWithinReconnectGrace respects liveReconnectUntil', () => {
  const now = new Date('2026-07-31T12:00:00Z');
  assert.equal(isWithinReconnectGrace({ liveReconnecting: false }, now), false);
  assert.equal(
    isWithinReconnectGrace(
      {
        liveReconnecting: true,
        liveReconnectUntil: new Date('2026-07-31T12:00:20Z'),
      },
      now
    ),
    true
  );
  assert.equal(
    isWithinReconnectGrace(
      {
        liveReconnecting: true,
        liveReconnectUntil: new Date('2026-07-31T11:59:50Z'),
      },
      now
    ),
    false
  );
});

test('scheduleOfflineTimer fires once and can be cancelled', async () => {
  __resetReconnectTimersForTests();
  let fired = 0;
  scheduleOfflineTimer('evt1', 30, async () => {
    fired += 1;
  });
  clearOfflineTimer('evt1');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 0);

  scheduleOfflineTimer('evt1', 40, async () => {
    fired += 1;
  });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 1);
  assert.ok(LIVE_RECONNECT_GRACE_MS >= 30_000);
  __resetReconnectTimersForTests();
});
