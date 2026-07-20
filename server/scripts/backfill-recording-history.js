#!/usr/bin/env node
/**
 * Backfill Event.recordings[] from existing R2 objects for one event.
 * Does NOT delete or modify any R2 objects — only updates MongoDB metadata.
 *
 * Usage:
 *   node scripts/backfill-recording-history.js <eventId> [--dry-run]
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Event } from '../src/models/Event.js';
import { R2_BUCKET, isR2Configured, r2ObjectUrl } from '../src/utils/r2.js';
import {
  parseRecordingFilenameTimestamp,
  syncLegacyRecordingFields,
  addDays,
  RECORDING_PUBLIC_DAYS,
} from '../src/utils/recording.js';

const eventId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!eventId || !/^[a-fA-F0-9]{24}$/.test(eventId)) {
  console.error('Usage: node scripts/backfill-recording-history.js <eventId> [--dry-run]');
  process.exit(1);
}

if (!isR2Configured()) {
  console.error('R2 is not configured');
  process.exit(1);
}

const endpoint = (
  process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
).replace(/\/+$/, '');

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

async function listObjects(prefix) {
  const out = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    out.push(...(res.Contents || []));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function probeDuration(key) {
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: 600 }
  );
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', url],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 5e6 }
  );
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || '').slice(0, 300) };
  try {
    const j = JSON.parse(r.stdout || '{}');
    const sec = Number(j.format?.duration || 0);
    if (!Number.isFinite(sec) || sec <= 0) return { ok: false, error: 'zero_duration' };
    return { ok: true, durationSec: Math.round(sec) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

await mongoose.connect(process.env.MONGODB_URI);
const event = await Event.findById(eventId);
if (!event) {
  console.error('Event not found');
  process.exit(1);
}

const prefix = `recordings/${eventId}/`;
const objects = (await listObjects(prefix))
  .filter((o) => o.Key && o.Key.toLowerCase().endsWith('.mp4') && Number(o.Size || 0) > 0)
  .sort((a, b) => String(a.Key).localeCompare(String(b.Key)));

console.log(`Event ${event.shortCode || eventId} — ${objects.length} R2 mp4 object(s)`);

const parts = [];
const skipped = [];

for (const obj of objects) {
  const key = obj.Key;
  const filename = key.split('/').pop();
  const sizeBytes = Number(obj.Size || 0);

  // Skip tiny empty-ish objects (< 50KB often corrupt stubs)
  if (sizeBytes < 50_000) {
    const probe = await probeDuration(key);
    if (!probe.ok) {
      skipped.push({ key, sizeBytes, reason: `tiny+invalid: ${probe.error}` });
      continue;
    }
  }

  const probe = await probeDuration(key);
  if (!probe.ok) {
    skipped.push({ key, sizeBytes, reason: probe.error });
    continue;
  }

  const startedAt =
    parseRecordingFilenameTimestamp(filename) || obj.LastModified || new Date();
  const endedAt = new Date(startedAt.getTime() + probe.durationSec * 1000);

  parts.push({
    r2Key: key,
    r2Url: r2ObjectUrl(key),
    filename,
    localPath: '',
    storage: 'r2',
    startedAt,
    endedAt,
    durationSec: probe.durationSec,
    sizeBytes,
    createdAt: obj.LastModified || endedAt,
  });

  console.log(
    `  OK  Part candidate ${filename}  ${probe.durationSec}s  ${(sizeBytes / 1e6).toFixed(1)}MB`
  );
}

parts.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

console.log(`\nValid parts: ${parts.length}`);
console.log(`Skipped: ${skipped.length}`);
for (const s of skipped) {
  console.log(`  SKIP ${s.key} (${s.sizeBytes}b) — ${s.reason}`);
}

if (dryRun) {
  console.log('\nDry run — MongoDB not modified.');
  await mongoose.disconnect();
  process.exit(0);
}

event.recordings = parts;
event.recordingDeletedAt = undefined;
event.recordingHidden = false;
if (parts.length) {
  const newest = parts[parts.length - 1];
  const oldest = parts[0];
  event.recordingPublicUntil = addDays(
    newest.endedAt || newest.createdAt || new Date(),
    RECORDING_PUBLIC_DAYS
  );
  if (!event.recordingRecordedAt) event.recordingRecordedAt = oldest.endedAt;
  syncLegacyRecordingFields(event);
} else {
  console.warn('No valid parts — leaving event recording fields unchanged.');
  await mongoose.disconnect();
  process.exit(1);
}

await event.save();
console.log(`\nSaved ${parts.length} parts to Event.recordings[]`);
console.log(`Legacy recordingR2Key → ${event.recordingR2Key}`);
await mongoose.disconnect();
