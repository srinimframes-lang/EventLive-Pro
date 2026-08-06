import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Event } from '../models/Event.js';
import {
  listActiveRecordingParts,
  getRecordingState,
} from './recording.js';
import {
  R2_BUCKET,
  isR2Configured,
  uploadRecordingToR2,
  r2PublicUrl,
  presignRecordingUrl,
} from './r2.js';
import { S3Client } from '@aws-sdk/client-s3';

const MERGE_ROOT = path.join(os.tmpdir(), 'eventlive-merge');
const FINAL_KEY_SUFFIX = 'final/full-event.mp4';
/** Require this much free disk beyond estimated merge needs (bytes). */
const DISK_SAFETY_MARGIN = 2 * 1024 * 1024 * 1024; // 2 GiB
const MIN_FREE_BYTES = 3 * 1024 * 1024 * 1024; // refuse if free < 3 GiB

let mergeBusy = false;
const mergeQueue = [];

function getS3() {
  const endpoint = (
    process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  ).replace(/\/+$/, '');
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

function runCmd(bin, args, { timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${(stderr || stdout).slice(-800)}`));
    });
  });
}

export function freeDiskBytes(dir = MERGE_ROOT) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return fs.statfsSync(dir).bavail * fs.statfsSync(dir).bsize;
  } catch {
    // Node <19.6 may lack statfsSync — fall back via df parse is avoided; use root.
    try {
      const st = fs.statfsSync('/');
      return st.bavail * st.bsize;
    } catch {
      return null;
    }
  }
}

export function finalRecordingKey(eventId) {
  return `recordings/${eventId}/${FINAL_KEY_SUFFIX}`;
}

export function hasReadyFinalRecording(event) {
  return (
    event?.finalRecordingStatus === 'ready' &&
    Boolean(String(event.finalRecordingR2Key || '').trim())
  );
}

async function probeFingerprint(inputPathOrUrl) {
  const { stdout } = await runCmd(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_type,codec_name,width,height,pix_fmt,sample_rate,channels,profile',
      '-show_entries',
      'format=format_name',
      '-of',
      'json',
      inputPathOrUrl,
    ],
    { timeoutMs: 120000 }
  );
  const j = JSON.parse(stdout || '{}');
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === 'video') || {};
  const a = streams.find((s) => s.codec_type === 'audio') || {};
  return [
    j.format?.format_name || '',
    v.codec_name || '',
    v.width || '',
    v.height || '',
    v.pix_fmt || '',
    v.profile || '',
    a.codec_name || '',
    a.sample_rate || '',
    a.channels || '',
  ].join('|');
}

async function downloadR2Object(s3, key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  await pipeline(res.Body, createWriteStream(destPath));
  const st = fs.statSync(destPath);
  if (!st.size) throw new Error(`Downloaded empty file for ${key}`);
  return st.size;
}

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Merge all active recording parts into one MP4 via ffmpeg concat + stream copy.
 * Never deletes original R2 part objects.
 */
export async function mergeEventRecordings(eventId, { force = false } = {}) {
  if (!isR2Configured()) throw new Error('R2 is not configured');

  const event = await Event.findById(eventId);
  if (!event) throw new Error('Event not found');
  if (event.isLive) throw new Error('Cannot finalize while the event is live');

  const parts = listActiveRecordingParts(event).filter(
    (p) => p.storage === 'r2' && p.r2Key
  );
  if (parts.length === 0) throw new Error('No R2 recording parts available to merge');
  if (parts.length === 1 && !force && event.finalRecordingStatus === 'ready') {
    return { skipped: true, reason: 'already_ready', key: event.finalRecordingR2Key };
  }

  // Single part: still produce a canonical final key via stream copy remux (faststart).
  const workDir = path.join(MERGE_ROOT, String(eventId), String(Date.now()));
  fs.mkdirSync(workDir, { recursive: true });

  const estimatedBytes = parts.reduce((s, p) => s + (Number(p.sizeBytes) || 0), 0);
  // Download all parts + write merged output ≈ 2x, plus margin.
  const need = estimatedBytes * 2 + DISK_SAFETY_MARGIN;
  const free = freeDiskBytes(workDir);
  if (free !== null && free < Math.max(need, MIN_FREE_BYTES)) {
    rmrf(workDir);
    throw new Error(
      `Insufficient disk space for merge (free=${free}, need≈${need}). Free space and retry.`
    );
  }

  event.finalRecordingStatus = 'processing';
  event.finalRecordingError = '';
  event.finalRecordingPartCount = parts.length;
  await event.save();

  const s3 = getS3();
  const localFiles = [];
  const fingerprints = [];

  try {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const dest = path.join(workDir, `${String(i).padStart(4, '0')}_${part.filename || `part${i}.mp4`}`);
      console.log(`[merge] downloading ${part.r2Key} → ${dest}`);
      await downloadR2Object(s3, part.r2Key, dest);
      localFiles.push(dest);
      const fp = await probeFingerprint(dest);
      fingerprints.push(fp);
      console.log(`[merge] fingerprint ${i + 1}/${parts.length}: ${fp}`);
    }

    const unique = [...new Set(fingerprints)];
    if (unique.length > 1) {
      event.finalRecordingStatus = 'incompatible';
      event.finalRecordingError = `Parts use incompatible codecs/containers (${unique.length} variants). Multi-part replay remains available.`;
      await event.save();
      rmrf(workDir);
      return {
        ok: false,
        status: 'incompatible',
        error: event.finalRecordingError,
        fingerprints: unique,
      };
    }

    const listPath = path.join(workDir, 'concat.txt');
    const listBody = localFiles
      .map((f) => `file '${f.replace(/'/g, `'\\''`)}'`)
      .join('\n');
    fs.writeFileSync(listPath, listBody, 'utf8');

    const outPath = path.join(workDir, 'full-event.mp4');
    console.log(`[merge] ffmpeg concat -c copy → ${outPath}`);
    await runCmd(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outPath,
      ],
      { timeoutMs: 60 * 60 * 1000 }
    );

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
      throw new Error('Merged output missing or empty');
    }

    const durationProbe = await runCmd(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', outPath],
      { timeoutMs: 60000 }
    );
    const durJson = JSON.parse(durationProbe.stdout || '{}');
    const durationSec = Math.max(0, Math.round(Number(durJson.format?.duration || 0)));

    const key = finalRecordingKey(event.id);
    console.log(`[merge] uploading ${outPath} → ${key}`);
    const { url, size } = await uploadRecordingToR2(outPath, key);

    event.finalRecordingR2Key = key;
    event.finalRecordingR2Url = url;
    event.finalRecordingStatus = 'ready';
    event.finalRecordingDurationSec = durationSec;
    event.finalRecordingCreatedAt = new Date();
    event.finalRecordingError = '';
    event.finalRecordingPartCount = parts.length;
    await event.save();

    rmrf(workDir);
    console.log(`[merge] ready event=${event.id} key=${key} size=${size} duration=${durationSec}s`);
    return {
      ok: true,
      status: 'ready',
      key,
      url,
      size,
      durationSec,
      partCount: parts.length,
    };
  } catch (err) {
    console.error(`[merge] failed event=${eventId}:`, err.message);
    try {
      event.finalRecordingStatus = 'failed';
      event.finalRecordingError = String(err.message || err).slice(0, 500);
      await event.save();
    } catch {
      /* ignore */
    }
    rmrf(workDir);
    throw err;
  }
}

function enqueueMerge(eventId, opts = {}) {
  return new Promise((resolve, reject) => {
    mergeQueue.push({ eventId, opts, resolve, reject });
    pumpMergeQueue();
  });
}

async function pumpMergeQueue() {
  if (mergeBusy) return;
  const next = mergeQueue.shift();
  if (!next) return;
  mergeBusy = true;
  try {
    const result = await mergeEventRecordings(next.eventId, next.opts);
    next.resolve(result);
  } catch (err) {
    next.reject(err);
  } finally {
    mergeBusy = false;
    if (mergeQueue.length) setImmediate(pumpMergeQueue);
  }
}

/** Public entry: serialize merges so only one runs on the VPS at a time. */
export function queueEventRecordingMerge(eventId, opts = {}) {
  return enqueueMerge(String(eventId), opts);
}

export function getMergeQueueStatus() {
  return { busy: mergeBusy, queued: mergeQueue.length };
}

/** Resolve a playable URL for the final merged recording (presigned or public). */
export async function resolveFinalRecordingPlayUrl(event, { expiresIn = 6 * 3600 } = {}) {
  if (!hasReadyFinalRecording(event)) return null;
  const key = event.finalRecordingR2Key;
  const publicUrl = r2PublicUrl(key);
  if (publicUrl) {
    return { url: publicUrl, storage: 'r2', expiresInSec: null, filename: 'full-event.mp4', final: true };
  }
  const url = await presignRecordingUrl(key, { expiresIn });
  if (!url) return null;
  return {
    url,
    storage: 'r2',
    expiresInSec: expiresIn,
    filename: 'full-event.mp4',
    final: true,
  };
}

export function finalRecordingPublicMeta(event) {
  if (!hasReadyFinalRecording(event)) {
    return {
      finalRecordingStatus: event.finalRecordingStatus || 'none',
      finalRecordingAvailable: false,
    };
  }
  return {
    finalRecordingStatus: 'ready',
    finalRecordingAvailable: true,
    finalRecordingDurationSec: event.finalRecordingDurationSec || 0,
    finalRecordingCreatedAt: event.finalRecordingCreatedAt || null,
    finalRecordingPartCount: event.finalRecordingPartCount || 0,
  };
}

export function adminFinalRecordingMeta(event) {
  const state = getRecordingState(event);
  return {
    ...finalRecordingPublicMeta(event),
    finalRecordingR2Key: event.finalRecordingR2Key || '',
    finalRecordingError: event.finalRecordingError || '',
    finalRecordingStatus: event.finalRecordingStatus || 'none',
    mergeQueue: getMergeQueueStatus(),
    canFinalize:
      !event.isLive &&
      state.recordingCount > 0 &&
      !['queued', 'processing'].includes(event.finalRecordingStatus || ''),
  };
}
