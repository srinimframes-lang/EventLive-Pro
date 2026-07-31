/**
 * Live reconnect grace: short OBS drops keep the event "live" with a
 * reconnecting flag so viewers are not flipped to offline/replay.
 * Timers are in-process; Mongo fields are the source of truth for polls.
 */

export const LIVE_RECONNECT_GRACE_MS = 30_000;
/** Wait after true offline so the last finalize-recording hook can land. */
export const RECORDING_MERGE_GRACE_MS = 45_000;

const offlineTimers = new Map();
const mergeTimers = new Map();

export function isWithinReconnectGrace(event, now = new Date()) {
  if (!event?.liveReconnecting) return false;
  const until = event.liveReconnectUntil ? new Date(event.liveReconnectUntil) : null;
  return Boolean(until && until.getTime() > now.getTime());
}

export function clearOfflineTimer(eventId) {
  const id = String(eventId || '');
  const t = offlineTimers.get(id);
  if (t) {
    clearTimeout(t);
    offlineTimers.delete(id);
  }
}

export function clearMergeTimer(eventId) {
  const id = String(eventId || '');
  const t = mergeTimers.get(id);
  if (t) {
    clearTimeout(t);
    mergeTimers.delete(id);
  }
}

/**
 * Schedule a one-shot callback after graceMs (replacing any prior timer).
 * @returns {boolean} true if scheduled
 */
export function scheduleOfflineTimer(eventId, graceMs, onFire) {
  const id = String(eventId || '');
  if (!id) return false;
  clearOfflineTimer(id);
  const handle = setTimeout(() => {
    offlineTimers.delete(id);
    Promise.resolve()
      .then(() => onFire())
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[reconnect] offline finalize failed for ${id}:`, err?.message || err);
      });
  }, Math.max(0, graceMs));
  offlineTimers.set(id, handle);
  return true;
}

export function scheduleMergeTimer(eventId, graceMs, onFire) {
  const id = String(eventId || '');
  if (!id) return false;
  clearMergeTimer(id);
  const handle = setTimeout(() => {
    mergeTimers.delete(id);
    Promise.resolve()
      .then(() => onFire())
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[merge] recording merge failed for ${id}:`, err?.message || err);
      });
  }, Math.max(0, graceMs));
  mergeTimers.set(id, handle);
  return true;
}

/** Test helper — clear all timers. */
export function __resetReconnectTimersForTests() {
  for (const id of [...offlineTimers.keys()]) clearOfflineTimer(id);
  for (const id of [...mergeTimers.keys()]) clearMergeTimer(id);
}
