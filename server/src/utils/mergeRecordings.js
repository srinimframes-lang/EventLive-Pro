import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  listActiveRecordingParts,
  RECORDINGS_ROOT,
  resolveRecordingAbsolutePath,
  replacePartsWithMergedRecording,
} from './recording.js';
import {
  deleteRecordingFromR2,
  downloadR2ObjectToFile,
  isR2Configured,
  uploadRecordingToR2,
} from './r2.js';
import { Event } from '../models/Event.js';

function runCmd(bin, args, { timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on('data', (c) => {
      stderr += String(c);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function probeDurationSec(filePath) {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve(0);
    }, 60_000);
    child.stdout.on('data', (c) => {
      out += String(c);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const n = Number.parseFloat(String(out).trim());
      resolve(Number.isFinite(n) ? Math.round(n) : 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(0);
    });
  });
}

async function ensureLocalPartFile(part, workDir) {
  const local = resolveRecordingAbsolutePath(part.localPath);
  if (local && fs.existsSync(local)) return local;

  if (part.storage === 'r2' && part.r2Key && isR2Configured()) {
    const dest = path.join(workDir, path.basename(part.r2Key) || `${part.filename || 'part'}.mp4`);
    await downloadR2ObjectToFile(part.r2Key, dest);
    return dest;
  }
  throw new Error(`missing local file for part ${part.filename || part.id}`);
}

async function ffmpegConcat(inputs, outputPath) {
  const listFile = `${outputPath}.txt`;
  const body = inputs.map((f) => `file '${String(f).replace(/'/g, `'\\''`)}'`).join('\n');
  fs.writeFileSync(listFile, body, 'utf8');
  try {
    await runCmd('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  } catch (copyErr) {
    // Fallback re-encode when codecs differ across OBS reconnect segments.
    await runCmd('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  } finally {
    try {
      fs.unlinkSync(listFile);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Merge active recording parts into one MP4 when the event is truly offline.
 * On success: soft-deletes prior parts and leaves a single replay.
 * On failure: leaves Parts intact and sets recordingMergeStatus=failed.
 *
 * @returns {{ ok: boolean, reason?: string, mergedPath?: string }}
 */
export async function mergeEventRecordings(eventId, { io = null } = {}) {
  const event = await Event.findById(eventId);
  if (!event) return { ok: false, reason: 'event_not_found' };

  if (event.isLive || event.liveReconnecting) {
    return { ok: false, reason: 'still_live' };
  }

  const parts = listActiveRecordingParts(event);
  if (parts.length <= 1) {
    event.recordingMergeStatus = 'skipped';
    event.recordingMergeError = '';
    event.recordingMergedAt = new Date();
    await event.save();
    return { ok: true, reason: 'single_part' };
  }

  event.recordingMergeStatus = 'pending';
  event.recordingMergeError = '';
  await event.save();

  const workDir = path.join(RECORDINGS_ROOT, String(event.id), '.merge-work');
  fs.mkdirSync(workDir, { recursive: true });

  const downloaded = [];
  try {
    const inputs = [];
    for (const part of parts) {
      const file = await ensureLocalPartFile(part, workDir);
      inputs.push(file);
      if (file.startsWith(workDir)) downloaded.push(file);
    }

    const outName = `merged_${Date.now()}.mp4`;
    const outPath = path.join(RECORDINGS_ROOT, String(event.id), outName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    await ffmpegConcat(inputs, outPath);
    const durationSec =
      (await probeDurationSec(outPath)) ||
      parts.reduce((sum, p) => sum + (Number(p.durationSec) || 0), 0);
    const startedAt = parts[0]?.startedAt || new Date();
    const endedAt = parts[parts.length - 1]?.endedAt || new Date();

    const oldR2Keys = parts.map((p) => p.r2Key).filter(Boolean);

    replacePartsWithMergedRecording(event, {
      filePath: outPath,
      durationSec,
      startedAt,
      endedAt,
    });
    event.recordingMergeStatus = 'merged';
    event.recordingMergeError = '';
    event.recordingMergedAt = new Date();
    await event.save();

    if (isR2Configured()) {
      try {
        const key = `recordings/${event.id}/${outName}`;
        const { url, size } = await uploadRecordingToR2(outPath, key);
        const { markRecordingPartUploaded } = await import('./recording.js');
        markRecordingPartUploaded(event, {
          filename: outName,
          localPath: outPath,
          r2Key: key,
          r2Url: url,
          sizeBytes: size,
        });
        await event.save();
        try {
          fs.unlinkSync(outPath);
        } catch {
          /* keep local if unlink fails */
        }
        for (const keyOld of oldR2Keys) {
          try {
            await deleteRecordingFromR2(keyOld);
          } catch {
            /* best-effort cleanup */
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[merge] R2 upload after merge failed: ${err.message}`);
      }
    }

    const recParts = listActiveRecordingParts(event);
    if (io) {
      io.to(`event:${event.id}`).emit('stream:status', {
        isLive: false,
        status: event.status,
        playbackMode: 'recorded',
        recordingUrl: event.recordingUrl,
        recordingAvailable: true,
        recordingCount: recParts.length,
        recordingMergeStatus: event.recordingMergeStatus,
        recordings: recParts.map((p, index) => ({
          id: p.id,
          part: index + 1,
          durationSec: p.durationSec,
          startedAt: p.startedAt,
          createdAt: p.createdAt,
          filename: p.filename,
        })),
      });
    }

    return { ok: true, mergedPath: outPath };
  } catch (err) {
    event.recordingMergeStatus = 'failed';
    event.recordingMergeError = String(err?.message || err).slice(0, 500);
    event.recordingMergedAt = new Date();
    await event.save();
    return { ok: false, reason: event.recordingMergeError };
  } finally {
    for (const f of downloaded) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmdirSync(workDir);
    } catch {
      /* ignore non-empty */
    }
  }
}
