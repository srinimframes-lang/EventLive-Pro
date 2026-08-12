/**
 * Hourly recording R2 sync — retry leftover uploads and delete only
 * HEAD-verified local copies. Never touches MediaMTX, HLS, or live ingest.
 */
import fs from 'fs';
import { isR2Configured } from '../utils/r2.js';
import { RECORDINGS_ROOT } from '../utils/recording.js';
import {
  RECORDING_R2_SWEEP_MS,
  runRecordingR2SyncCycle,
} from '../utils/recordingR2Sync.js';

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await runRecordingR2SyncCycle();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[r2] cleanup cycle failed:', err?.message || err);
  } finally {
    running = false;
  }
}

export function startRecordingCleanupWorker() {
  if (timer) return;
  const rootPresent = fs.existsSync(RECORDINGS_ROOT);
  const r2 = isR2Configured();
  // eslint-disable-next-line no-console
  console.log(
    `[r2] cleanup worker started (every ${Math.round(RECORDING_R2_SWEEP_MS / 60000)}m)` +
      `${r2 ? '' : ' — R2 not configured'}` +
      `${rootPresent ? '' : ' — recordings root missing'}`
  );
  timer = setInterval(() => {
    tick().catch(() => {});
  }, RECORDING_R2_SWEEP_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopRecordingCleanupWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
