import { Event } from '../models/Event.js';
import { env } from '../config/env.js';
import {
  deriveHlsPlaybackUrl,
  probeMediaMtxPublishing,
  resolveStreamKey,
} from '../utils/mediaStream.js';
import {
  applyHealthSample,
  evaluateStreamHealth,
  FAILOVER_CHECK_INTERVAL_MS,
  isFailoverCandidate,
  probeHlsPlaylist,
  publicFailoverSlice,
  resolveActiveSource,
} from '../utils/streamFailover.js';

let timer = null;
let running = false;

function emitFailoverEvents(io, event, transition) {
  if (!io || !event) return;
  const slice = publicFailoverSlice(event, { failoverEnabled: true });
  if (!slice) return;
  const room = `event:${event.id || event._id}`;
  const payload = {
    eventId: String(event.id || event._id),
    ...slice,
  };

  if (transition === 'failover') {
    io.to(room).emit('stream:failover', {
      ...payload,
      message: 'Server issue detected. Switching to backup stream...',
    });
  }
  if (transition === 'recovered') {
    io.to(room).emit('stream:server-recovered', payload);
    io.to('admins:super').emit('stream:server-recovered', payload);
  }
  io.to(room).emit('stream:playback-mode', payload);
}

async function checkOneEvent(event, io) {
  if (!isFailoverCandidate(event, { failoverEnabled: true })) return;

  const playbackUrl = deriveHlsPlaybackUrl(event);
  const [playlistOk, publishing] = await Promise.all([
    probeHlsPlaylist(playbackUrl),
    probeMediaMtxPublishing(resolveStreamKey(event)),
  ]);
  const { healthy, reason } = evaluateStreamHealth({ playlistOk, publishing });
  const patch = applyHealthSample(event, { healthy, reason });

  event.streamHealth = {
    ...(event.streamHealth?.toObject?.() || event.streamHealth || {}),
    ...patch.streamHealth,
  };
  event.backupStatus = patch.backupStatus;
  if (patch.playbackMode) event.playbackMode = patch.playbackMode;

  await event.save();

  if (patch.transition) {
    emitFailoverEvents(io, event, patch.transition);
  }
}

async function tick(getIo) {
  if (running || !env.failoverEnabled) return;
  running = true;
  try {
    const events = await Event.find({
      backupStreamEnabled: true,
      isLive: true,
      streamDisabled: { $ne: true },
      streamProvider: { $in: ['rtmp', 'hls'] },
      backupStatus: { $ne: 'disabled' },
    }).limit(100);

    const io = typeof getIo === 'function' ? getIo() : getIo;
    for (const event of events) {
      // eslint-disable-next-line no-await-in-loop
      await checkOneEvent(event, io);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[failover] health tick failed:', err?.message || err);
  } finally {
    running = false;
  }
}

/**
 * Start the failover health worker. No-op when FAILOVER_ENABLED is not true.
 * @param {{ getIo?: () => import('socket.io').Server|null }} [opts]
 */
export function startFailoverHealthWorker({ getIo = () => null } = {}) {
  if (!env.failoverEnabled) {
    // eslint-disable-next-line no-console
    console.log('[failover] Disabled (FAILOVER_ENABLED!=true) — health worker not started');
    return { stop: () => {} };
  }
  if (timer) return { stop: stopFailoverHealthWorker };

  // eslint-disable-next-line no-console
  console.log(
    `[failover] Health worker started (every ${FAILOVER_CHECK_INTERVAL_MS / 1000}s)`
  );
  // Slight delay so the HTTP server is fully up.
  timer = setInterval(() => {
    tick(getIo);
  }, FAILOVER_CHECK_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  return { stop: stopFailoverHealthWorker };
}

export function stopFailoverHealthWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Exported for tests / admin diagnostics. */
export async function runFailoverHealthCheck(event, { getIo = () => null } = {}) {
  if (!env.failoverEnabled) {
    return { skipped: true, reason: 'failover_disabled' };
  }
  await checkOneEvent(event, typeof getIo === 'function' ? getIo() : getIo);
  return {
    skipped: false,
    healthy: (Number(event.streamHealth?.consecutiveFailures) || 0) === 0,
    activeSource: resolveActiveSource(event, { failoverEnabled: true }),
    backupStatus: event.backupStatus,
    streamHealth: event.streamHealth,
  };
}
