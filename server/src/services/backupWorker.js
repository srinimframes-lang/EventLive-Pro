/**
 * Daily backup scheduler — low-frequency timer; never touches MediaMTX/OBS.
 * Equivalent to a cron job: runs once per day at BACKUP_HOUR_UTC (default 03:00 UTC).
 */
import {
  isBackupEnabled,
  computeNextScheduledAt,
  setNextScheduledAt,
  runBackup,
  getBackupRuntimeState,
  pushBackupLog,
} from '../utils/backup.js';

const TICK_MS = Math.max(30_000, Number(process.env.BACKUP_TICK_MS) || 60_000);

let timer = null;
let lastScheduledDayKey = '';

function dayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}-${backupHour()}`;
}

function backupHour() {
  const n = Number(process.env.BACKUP_HOUR_UTC);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return Math.floor(n);
  return 3;
}

async function tick(getIo) {
  if (!isBackupEnabled()) {
    setNextScheduledAt(computeNextScheduledAt());
    return;
  }
  const now = new Date();
  setNextScheduledAt(computeNextScheduledAt(now));

  if (now.getUTCHours() !== backupHour()) return;
  // Run once per calendar day at the scheduled hour (first tick inside that hour).
  const key = dayKey(now);
  if (key === lastScheduledDayKey) return;
  lastScheduledDayKey = key;

  pushBackupLog({ level: 'info', message: 'Scheduled backup tick fired' });
  try {
    await runBackup({ trigger: 'schedule', getIo });
  } catch (err) {
    pushBackupLog({
      level: 'error',
      message: 'Scheduled backup threw',
      detail: err?.message || String(err),
    });
  }
}

/**
 * @param {{ getIo?: () => import('socket.io').Server | null }} opts
 */
export function startBackupWorker({ getIo } = {}) {
  if (timer) return;
  setNextScheduledAt(computeNextScheduledAt());
  if (!isBackupEnabled()) {
    // eslint-disable-next-line no-console
    console.log('[backup] Disabled (BACKUP_ENABLED=false) — worker not scheduling runs');
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[backup] Daily scheduler active — hour=${backupHour()} UTC, tick=${TICK_MS}ms, next=${getBackupRuntimeState().nextScheduledAt?.toISOString?.() || ''}`
    );
  }
  timer = setInterval(() => {
    tick(getIo).catch(() => {});
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  // Align nextScheduledAt immediately
  setNextScheduledAt(computeNextScheduledAt());
}

export function stopBackupWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
