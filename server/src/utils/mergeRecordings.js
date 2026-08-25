import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  listActiveRecordingParts,
  markRecordingPartUploaded,
  RECORDINGS_ROOT,
  resolveRecordingAbsolutePath,
  replacePartsWithMergedRecording,
} from './recording.js';
import {
  deleteRecordingFromR2,
  downloadR2ObjectToFile,
  headR2Object,
  isR2Configured,
  uploadRecordingToR2,
} from './r2.js';
import {
  safeUnlinkLocalAfterR2,
  unlinkOriginalsReplacedByMergedR2,
} from './recordingR2Sync.js';
import { inspectMp4Init } from './recordingPlayback.js';
import {
  concatInputsNeedReencode,
  isFfprobeMergedVideoOk,
  isValidatedMergedOutput,
  mayDeleteOriginalsAfterValidatedMerge,
  selectConcatVideoInputs,
} from './mergeRecordingsLogic.js';
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

async function probeMp4Streams(filePath) {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-of', 'json', filePath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve({ hasVideo: false, hasAudio: false, videoCodec: '', audioCodec: '', durationSec: 0 });
    }, 60_000);
    child.stdout.on('data', (c) => {
      out += String(c);
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(out || '{}');
        const streams = Array.isArray(json.streams) ? json.streams : [];
        const video = streams.find((s) => s.codec_type === 'video');
        const audio = streams.find((s) => s.codec_type === 'audio');
        const durationSec = Math.round(
          Number(video?.duration || audio?.duration || json.format?.duration || 0)
        );
        resolve({
          hasVideo: Boolean(video),
          hasAudio: Boolean(audio),
          videoCodec: String(video?.codec_name || ''),
          audioCodec: String(audio?.codec_name || ''),
          durationSec: Number.isFinite(durationSec) ? durationSec : 0,
        });
      } catch {
        resolve({ hasVideo: false, hasAudio: false, videoCodec: '', audioCodec: '', durationSec: 0 });
      }
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ hasVideo: false, hasAudio: false, videoCodec: '', audioCodec: '', durationSec: 0 });
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

async function inspectLocalMp4Init(filePath) {
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return inspectMp4Init(Buffer.alloc(0));
  }
  const need = Math.min(8 * 1024 * 1024, size);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(need);
    const { bytesRead } = fs.readSync(fd, buf, 0, need, 0);
    return inspectMp4Init(buf.subarray(0, bytesRead));
  } finally {
    fs.closeSync(fd);
  }
}

async function probePartForMerge(part, workDir) {
  const file = await ensureLocalPartFile(part, workDir);
  const streams = await probeMp4Streams(file);
  let sizeBytes = Number(part.sizeBytes) || 0;
  try {
    sizeBytes = fs.statSync(file).size;
  } catch {
    /* keep stored size */
  }
  return {
    part,
    file,
    hasVideo: Boolean(streams.hasVideo),
    hasAudio: Boolean(streams.hasAudio),
    videoCodec: streams.videoCodec || '',
    audioCodec: streams.audioCodec || '',
    durationSec: Number(streams.durationSec || part.durationSec || 0),
    sizeBytes,
  };
}

async function ffmpegConcat(inputs, outputPath, { forceReencode = false } = {}) {
  const listFile = `${outputPath}.txt`;
  const body = inputs.map((f) => `file '${String(f).replace(/'/g, `'\\''`)}'`).join('\n');
  fs.writeFileSync(listFile, body, 'utf8');
  try {
    if (!forceReencode) {
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
          '-map',
          '0',
          '-movflags',
          '+faststart',
          outputPath,
        ]);
        const copied = await probeMp4Streams(outputPath);
        if (isFfprobeMergedVideoOk(copied)) return copied;
        throw new Error('concat copy produced no H.264 video track');
      } catch (copyErr) {
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
        const encoded = await probeMp4Streams(outputPath);
        if (!isFfprobeMergedVideoOk(encoded)) {
          throw new Error(`concat re-encode produced no H.264 video track (${copyErr?.message || copyErr})`);
        }
        return encoded;
      }
    } else {
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
      const encoded = await probeMp4Streams(outputPath);
      if (!isFfprobeMergedVideoOk(encoded)) {
        throw new Error('concat re-encode produced no H.264 video track');
      }
      return encoded;
    }
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
  let outPath = '';
  try {
    const probedParts = [];
    for (const part of parts) {
      const row = await probePartForMerge(part, workDir);
      probedParts.push(row);
      if (row.file.startsWith(workDir)) downloaded.push(row.file);
    }

    const videoInputs = selectConcatVideoInputs(probedParts);
    if (videoInputs.length === 0) {
      throw new Error('no H.264 video segments to merge (audio-only or empty blips skipped)');
    }
    if (videoInputs.length === 1) {
      event.recordingMergeStatus = 'skipped';
      event.recordingMergeError = '';
      event.recordingMergedAt = new Date();
      await event.save();
      return { ok: true, reason: 'single_video_part' };
    }

    const outName = `merged_${Date.now()}.mp4`;
    outPath = path.join(RECORDINGS_ROOT, String(event.id), outName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const files = videoInputs.map((row) => row.file);
    await ffmpegConcat(files, outPath, {
      forceReencode: concatInputsNeedReencode(videoInputs),
    });
    const probed = await probeMp4Streams(outPath);
    const init = await inspectLocalMp4Init(outPath);
    if (!isFfprobeMergedVideoOk(probed) || !isValidatedMergedOutput(init, probed)) {
      throw new Error(
        `merged MP4 failed validation (ffprobe video=${probed.videoCodec || 'none'} ` +
          `inspect video=${init.videoCodec || 'none'} tracks=${init.trackCount} ` +
          `duration=${init.durationSec || probed.durationSec || 0})`
      );
    }
    const durationSec =
      probed.durationSec ||
      init.durationSec ||
      (await probeDurationSec(outPath)) ||
      videoInputs.reduce((sum, row) => sum + (Number(row.durationSec) || 0), 0);
    const startedAt = videoInputs[0]?.part?.startedAt || parts[0]?.startedAt || new Date();
    const endedAt =
      videoInputs[videoInputs.length - 1]?.part?.endedAt ||
      parts[parts.length - 1]?.endedAt ||
      new Date();

    const oldR2Keys = parts.map((p) => p.r2Key).filter(Boolean);
    const originalLocalPaths = parts.map((p) => p.localPath).filter(Boolean);

    replacePartsWithMergedRecording(event, {
      filePath: outPath,
      durationSec,
      startedAt,
      endedAt,
    });
    event.recordingMergeStatus = isR2Configured() ? 'uploading' : 'merged';
    event.recordingMergeError = '';
    event.recordingMergedAt = new Date();
    await event.save();

    if (isR2Configured()) {
      try {
        const key = `recordings/${event.id}/${outName}`;
        console.log(`[r2] upload started ${outPath} -> ${key}`);
        const { url, size } = await uploadRecordingToR2(outPath, key);
        const head = await headR2Object(key);
        const cleanupOk = mayDeleteOriginalsAfterValidatedMerge({
          validated: true,
          r2Head: head,
          expectedSize: size,
        });
        if (!cleanupOk.ok) {
          throw new Error(
            `R2 HEAD mismatch for ${key}: remote ${head?.size || 0} vs uploaded ${size} (${cleanupOk.reason})`
          );
        }
        console.log(`[r2] upload verified (${size} bytes): ${key}`);
        markRecordingPartUploaded(event, {
          filename: outName,
          localPath: outPath,
          r2Key: key,
          r2Url: url,
          sizeBytes: size,
        });
        event.recordingMergeStatus = 'merged';
        await event.save();
        await safeUnlinkLocalAfterR2({
          localPath: outPath,
          r2Key: key,
          expectedLocalSize: size,
          storage: 'r2',
        });
        await unlinkOriginalsReplacedByMergedR2(originalLocalPaths, {
          mergedR2Key: key,
          mergedSize: size,
        });
        for (const keyOld of oldR2Keys) {
          try {
            await deleteRecordingFromR2(keyOld);
          } catch {
            /* best-effort cleanup */
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[r2] upload failed after merge: ${err.message}`);
        event.recordingMergeStatus = 'merged';
        event.recordingMergeError = String(err?.message || err).slice(0, 500);
        await event.save();
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
    if (outPath) {
      try {
        fs.unlinkSync(outPath);
      } catch {
        /* keep disk if unlink fails; originals are untouched */
      }
    }
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
