/**
 * Platform backup engine — MongoDB + local MediaMTX recordings.
 * Read-only against live pipelines: never stops MediaMTX, nginx, ffmpeg, or OBS ingest.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import archiver from 'archiver';
import { env } from '../config/env.js';
import { Backup } from '../models/Backup.js';
import { RECORDINGS_ROOT } from './recording.js';
import { isR2Configured, uploadFileToR2, downloadR2ObjectToFile, presignR2Url } from './r2.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKUPS_ROOT = path.resolve(
  process.env.BACKUPS_ROOT || path.join(__dirname, '../../../backups')
);

export const BACKUP_KEEP_COUNT = Math.max(1, Number(process.env.BACKUP_KEEP_COUNT) || 30);
export const BACKUP_MAX_RETRIES = Math.max(0, Number(process.env.BACKUP_MAX_RETRIES) || 2);
/** Skip recording files touched within this window (ms) so live finalize is not disturbed. */
export const BACKUP_SKIP_RECENT_MS = Math.max(0, Number(process.env.BACKUP_SKIP_RECENT_MS) || 120_000);

const LOG_RING = [];
const MAX_LOGS = 100;

let running = false;
let lastRunAt = null;
let nextScheduledAt = null;

export function pushBackupLog(entry) {
  const row = {
    at: Date.now(),
    level: entry.level || 'info',
    message: String(entry.message || ''),
    detail: entry.detail || '',
  };
  LOG_RING.unshift(row);
  if (LOG_RING.length > MAX_LOGS) LOG_RING.length = MAX_LOGS;
  return row;
}

export function listBackupLogs() {
  return LOG_RING.slice(0, 100);
}

export function isBackupEnabled() {
  // Default ON so production VPS backs up; set BACKUP_ENABLED=false to disable.
  if (process.env.BACKUP_ENABLED === 'false') return false;
  return true;
}

export function isBackupUploadEnabled() {
  if (process.env.BACKUP_UPLOAD_R2 === 'false') return false;
  return isR2Configured();
}

/** Daily schedule hour (UTC). Default 03:00 UTC. */
export function backupScheduleHourUtc() {
  const n = Number(process.env.BACKUP_HOUR_UTC);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return Math.floor(n);
  return 3;
}

export function computeNextScheduledAt(from = new Date()) {
  const hour = backupScheduleHourUtc();
  const d = new Date(from);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0));
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function setNextScheduledAt(date) {
  nextScheduledAt = date;
}

export function getBackupRuntimeState() {
  return {
    enabled: isBackupEnabled(),
    running,
    lastRunAt,
    nextScheduledAt: nextScheduledAt || computeNextScheduledAt(),
    keepCount: BACKUP_KEEP_COUNT,
    backupsRoot: BACKUPS_ROOT,
    recordingsRoot: RECORDINGS_ROOT,
    uploadR2: isBackupUploadEnabled(),
    scheduleHourUtc: backupScheduleHourUtc(),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stampId(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `eventlive-backup-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * mongodump when available; otherwise JSON export of all collections (read-only).
 */
export async function dumpMongoDb(destDir) {
  ensureDir(destDir);
  const uri = env.mongoUri;
  try {
    await execFileAsync(
      'mongodump',
      ['--uri', uri, '--out', destDir, '--gzip'],
      { timeout: 30 * 60 * 1000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
    );
    return {
      status: 'ok',
      method: 'mongodump',
      detail: 'mongodump --gzip completed',
    };
  } catch (err) {
    pushBackupLog({
      level: 'warning',
      message: 'mongodump unavailable or failed — falling back to JSON export',
      detail: err.message || String(err),
    });
  }

  // Fallback: mongoose read of all collections (never writes to live DB).
  const db = mongoose.connection.db;
  if (!db) {
    return { status: 'failed', method: 'json-export', detail: 'No mongoose DB connection' };
  }
  const cols = await db.listCollections().toArray();
  let count = 0;
  for (const c of cols) {
    const name = c.name;
    if (!name || name.startsWith('system.')) continue;
    const docs = await db.collection(name).find({}).toArray();
    const out = path.join(destDir, `${name}.json`);
    await fs.promises.writeFile(out, JSON.stringify(docs, null, 0), 'utf8');
    count += 1;
  }
  return {
    status: 'ok',
    method: 'json-export',
    detail: `Exported ${count} collection(s) as JSON`,
  };
}

/**
 * Copy finalized recordings; skip very recent files (likely still being written).
 */
export async function copyRecordings(destDir) {
  ensureDir(destDir);
  const root = path.resolve(RECORDINGS_ROOT);
  if (!(await pathExists(root))) {
    return {
      status: 'skipped',
      fileCount: 0,
      skippedLive: 0,
      detail: `Recordings root missing: ${root}`,
    };
  }

  let fileCount = 0;
  let skippedLive = 0;
  const cutoff = Date.now() - BACKUP_SKIP_RECENT_MS;

  async function walk(dir, rel = '') {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const childRel = rel ? path.join(rel, ent.name) : ent.name;
      if (ent.isDirectory()) {
        await walk(abs, childRel);
        continue;
      }
      if (!ent.isFile()) continue;
      // Only archive media products — skip temp/partial if any
      const lower = ent.name.toLowerCase();
      if (!lower.endsWith('.mp4') && !lower.endsWith('.m4s') && !lower.endsWith('.mp4.tmp')) {
        continue;
      }
      if (lower.endsWith('.tmp')) {
        skippedLive += 1;
        continue;
      }
      let st;
      try {
        st = await fs.promises.stat(abs);
      } catch {
        skippedLive += 1;
        continue;
      }
      if (st.mtimeMs > cutoff) {
        skippedLive += 1;
        continue;
      }
      const target = path.join(destDir, childRel);
      ensureDir(path.dirname(target));
      await fs.promises.copyFile(abs, target);
      fileCount += 1;
    }
  }

  await walk(root);

  return {
    status: fileCount > 0 ? 'ok' : skippedLive > 0 ? 'partial' : 'ok',
    fileCount,
    skippedLive,
    detail: `Copied ${fileCount} file(s); skipped ${skippedLive} recent/in-progress`,
  };
}

export async function zipDirectory(sourceDir, zipPath) {
  ensureDir(path.dirname(zipPath));
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
  const st = await fs.promises.stat(zipPath);
  return st.size;
}

async function rmrf(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

/**
 * Delete local zip archives beyond KEEP_COUNT (oldest first).
 * Also removes matching Mongo Backup docs for pruned files.
 */
export async function pruneOldBackups({ keep = BACKUP_KEEP_COUNT } = {}) {
  ensureDir(BACKUPS_ROOT);
  const files = (await fs.promises.readdir(BACKUPS_ROOT))
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const abs = path.join(BACKUPS_ROOT, f);
      let mtime = 0;
      try {
        mtime = fs.statSync(abs).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { f, abs, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const remove = files.slice(keep);
  for (const item of remove) {
    try {
      await fs.promises.unlink(item.abs);
      await Backup.deleteMany({ localFilename: item.f });
      pushBackupLog({ level: 'info', message: `Pruned old backup ${item.f}` });
    } catch (err) {
      pushBackupLog({
        level: 'warning',
        message: `Failed to prune ${item.f}`,
        detail: err.message,
      });
    }
  }
  return { kept: files.length - remove.length, removed: remove.length };
}

function notifyAdmin(getIo, event, payload) {
  try {
    const io = typeof getIo === 'function' ? getIo() : getIo;
    if (!io) return;
    io.to('admins:super').emit(event, payload);
  } catch {
    /* ignore */
  }
}

/**
 * Run one full backup. Safe during live streams (read-only dump + skip recent files).
 */
export async function runBackup({
  trigger = 'schedule',
  getIo = null,
  attempt = 0,
} = {}) {
  if (running) {
    return { ok: false, message: 'Backup already running' };
  }
  running = true;
  lastRunAt = new Date();
  const backupId = stampId(lastRunAt);
  const workDir = path.join(BACKUPS_ROOT, backupId);
  const zipName = `${backupId}.zip`;
  const zipPath = path.join(BACKUPS_ROOT, zipName);

  const doc = await Backup.create({
    backupId,
    trigger,
    status: 'running',
    startedAt: lastRunAt,
    retries: attempt,
    localFilename: zipName,
  });

  pushBackupLog({ level: 'info', message: `Backup started (${trigger})`, detail: backupId });

  try {
    ensureDir(BACKUPS_ROOT);
    ensureDir(workDir);

    const mongoDir = path.join(workDir, 'mongodb');
    const recDir = path.join(workDir, 'recordings');

    const mongo = await dumpMongoDb(mongoDir);
    doc.mongoStatus = mongo.status;
    doc.mongoMethod = mongo.method || '';
    doc.mongoDetail = mongo.detail || '';

    const rec = await copyRecordings(recDir);
    doc.recordingsStatus = rec.status;
    doc.recordingsFileCount = rec.fileCount || 0;
    doc.recordingsSkippedLive = rec.skippedLive || 0;
    doc.recordingsDetail = rec.detail || '';

    // Manifest (no secrets)
    const manifest = {
      backupId,
      createdAt: lastRunAt.toISOString(),
      trigger,
      mongo,
      recordings: rec,
      host: process.env.HOSTNAME || '',
      note: 'EventLive Pro platform backup — does not include live HLS cache or MediaMTX process state',
    };
    await fs.promises.writeFile(
      path.join(workDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    if (mongo.status === 'failed' && (rec.status === 'failed' || rec.fileCount === 0)) {
      throw new Error(`Backup failed: mongo=${mongo.detail}; recordings=${rec.detail}`);
    }

    const sizeBytes = await zipDirectory(workDir, zipPath);
    await rmrf(workDir);

    doc.sizeBytes = sizeBytes;
    doc.localPath = zipPath;

    if (isBackupUploadEnabled()) {
      try {
        const key = `backups/${zipName}`;
        await uploadFileToR2(zipPath, key, 'application/zip');
        doc.r2Key = key;
        doc.r2Uploaded = true;
      } catch (err) {
        pushBackupLog({
          level: 'warning',
          message: 'R2 upload failed (local zip retained)',
          detail: err.message,
        });
        doc.recordingsDetail = `${doc.recordingsDetail}; R2: ${err.message}`.slice(0, 500);
      }
    }

    const partial =
      mongo.status === 'failed' ||
      rec.status === 'failed' ||
      rec.status === 'partial' ||
      (doc.r2Key === '' && isBackupUploadEnabled());

    doc.status = partial ? 'partial' : 'success';
    doc.finishedAt = new Date();
    doc.durationMs = doc.finishedAt.getTime() - lastRunAt.getTime();
    await doc.save();

    await pruneOldBackups();

    const payload = {
      backupId,
      status: doc.status,
      sizeBytes,
      mongoStatus: doc.mongoStatus,
      recordingsStatus: doc.recordingsStatus,
      finishedAt: doc.finishedAt,
    };
    notifyAdmin(getIo, 'backup:completed', payload);
    pushBackupLog({ level: 'info', message: `Backup ${doc.status}`, detail: backupId });

    return { ok: true, data: doc.toObject() };
  } catch (err) {
    const message = err?.message || String(err);
    pushBackupLog({ level: 'error', message: 'Backup failed', detail: message });
    doc.status = 'failed';
    doc.error = message.slice(0, 1000);
    doc.finishedAt = new Date();
    doc.durationMs = doc.finishedAt.getTime() - lastRunAt.getTime();
    await doc.save().catch(() => {});

    try {
      await rmrf(workDir);
    } catch {
      /* ignore */
    }

    notifyAdmin(getIo, 'backup:failed', {
      backupId,
      error: message,
      retries: attempt,
      willRetry: attempt < BACKUP_MAX_RETRIES,
    });

    if (attempt < BACKUP_MAX_RETRIES) {
      const delay = Math.min(60_000, 5_000 * 2 ** attempt);
      pushBackupLog({
        level: 'warning',
        message: `Retrying backup in ${delay}ms (attempt ${attempt + 1})`,
      });
      running = false;
      await new Promise((r) => setTimeout(r, delay));
      return runBackup({ trigger, getIo, attempt: attempt + 1 });
    }

    return { ok: false, message, data: doc.toObject?.() || doc };
  } finally {
    running = false;
  }
}

export async function listBackups({ limit = 50 } = {}) {
  return Backup.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(100, limit))
    .lean();
}

export async function getBackupById(id) {
  return Backup.findOne({
    $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { backupId: id }],
  });
}

export function resolveLocalBackupPath(doc) {
  if (!doc) return null;
  if (doc.localPath && fs.existsSync(doc.localPath)) return doc.localPath;
  if (doc.localFilename) {
    const p = path.join(BACKUPS_ROOT, doc.localFilename);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function getDownloadTarget(doc) {
  const local = resolveLocalBackupPath(doc);
  if (local) return { type: 'local', path: local, filename: path.basename(local) };
  if (doc.r2Key && isR2Configured()) {
    const url = await presignR2Url(doc.r2Key, {
      expiresIn: 3600,
      downloadFilename: doc.localFilename || 'backup.zip',
    });
    return { type: 'r2', url, filename: doc.localFilename || 'backup.zip' };
  }
  return null;
}

/**
 * Restore MongoDB (+ optional recordings) from a backup zip.
 * Never stops MediaMTX. Uses mongorestore when dump was mongodump; JSON import otherwise.
 */
export async function restoreBackup(doc, { restoreRecordings = true, getIo = null } = {}) {
  if (running) throw new Error('Cannot restore while a backup is running');
  running = true;
  const work = path.join(BACKUPS_ROOT, `restore-${doc.backupId}-${Date.now()}`);
  try {
    ensureDir(work);
    let zipPath = resolveLocalBackupPath(doc);
    if (!zipPath && doc.r2Key && isR2Configured()) {
      zipPath = path.join(work, doc.localFilename || 'backup.zip');
      await downloadR2ObjectToFile(doc.r2Key, zipPath);
    }
    if (!zipPath || !fs.existsSync(zipPath)) {
      throw new Error('Backup archive not found locally or on R2');
    }

    // Extract with PowerShell Expand-Archive / unzip
    const extractDir = path.join(work, 'extracted');
    ensureDir(extractDir);
    try {
      await execFileAsync('unzip', ['-o', zipPath, '-d', extractDir], {
        timeout: 30 * 60 * 1000,
        windowsHide: true,
      });
    } catch {
      if (process.platform === 'win32') {
        await execFileAsync(
          'powershell',
          ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`],
          { timeout: 30 * 60 * 1000, windowsHide: true }
        );
      } else {
        throw new Error('unzip failed — install unzip on the VPS to restore');
      }
    }

    const mongoDir = path.join(extractDir, 'mongodb');
    let mongoRestored = false;
    if (await pathExists(mongoDir)) {
      const bsonFiles = [];
      async function findBson(dir) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          const abs = path.join(dir, ent.name);
          if (ent.isDirectory()) await findBson(abs);
          else if (/\.bson(\.gz)?$/i.test(ent.name)) bsonFiles.push(abs);
        }
      }
      await findBson(mongoDir).catch(() => {});
      if (bsonFiles.length) {
        await execFileAsync(
          'mongorestore',
          ['--uri', env.mongoUri, '--gzip', '--drop', mongoDir],
          { timeout: 60 * 60 * 1000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
        );
        mongoRestored = true;
      } else {
        // JSON collection files
        const db = mongoose.connection.db;
        const files = (await fs.promises.readdir(mongoDir)).filter((f) => f.endsWith('.json'));
        for (const f of files) {
          const name = f.replace(/\.json$/, '');
          const raw = await fs.promises.readFile(path.join(mongoDir, f), 'utf8');
          const docs = JSON.parse(raw);
          if (!Array.isArray(docs)) continue;
          const col = db.collection(name);
          await col.deleteMany({});
          if (docs.length) await col.insertMany(docs, { ordered: false });
        }
        mongoRestored = true;
      }
    }

    let recordingsRestored = 0;
    const recSrc = path.join(extractDir, 'recordings');
    if (restoreRecordings && (await pathExists(recSrc))) {
      ensureDir(RECORDINGS_ROOT);
      async function copyTree(dir, rel = '') {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          const abs = path.join(dir, ent.name);
          const childRel = rel ? path.join(rel, ent.name) : ent.name;
          if (ent.isDirectory()) {
            await copyTree(abs, childRel);
            continue;
          }
          const dest = path.join(RECORDINGS_ROOT, childRel);
          ensureDir(path.dirname(dest));
          // Do not overwrite a file modified in the last 2 minutes (live finalize)
          if (fs.existsSync(dest)) {
            const st = fs.statSync(dest);
            if (Date.now() - st.mtimeMs < BACKUP_SKIP_RECENT_MS) continue;
          }
          await fs.promises.copyFile(abs, dest);
          recordingsRestored += 1;
        }
      }
      await copyTree(recSrc);
    }

    const result = {
      ok: true,
      mongoRestored,
      recordingsRestored,
      backupId: doc.backupId,
    };
    notifyAdmin(getIo, 'backup:restored', result);
    pushBackupLog({
      level: 'info',
      message: 'Restore completed',
      detail: JSON.stringify(result),
    });
    return result;
  } finally {
    running = false;
    try {
      await rmrf(work);
    } catch {
      /* ignore */
    }
  }
}

export async function buildBackupStatus() {
  const runtime = getBackupRuntimeState();
  const latest = await Backup.findOne({}).sort({ createdAt: -1 }).lean();
  const lastSuccess = await Backup.findOne({ status: { $in: ['success', 'partial'] } })
    .sort({ createdAt: -1 })
    .lean();
  const count = await Backup.countDocuments({});
  let totalSize = 0;
  try {
    ensureDir(BACKUPS_ROOT);
    const zips = (await fs.promises.readdir(BACKUPS_ROOT)).filter((f) => f.endsWith('.zip'));
    for (const f of zips) {
      try {
        totalSize += fs.statSync(path.join(BACKUPS_ROOT, f)).size;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  const mongoOk = mongoose.connection.readyState === 1;
  let recordingsPresent = false;
  try {
    recordingsPresent = fs.existsSync(RECORDINGS_ROOT);
  } catch {
    recordingsPresent = false;
  }

  return {
    ...runtime,
    backupCount: count,
    totalLocalSizeBytes: totalSize,
    latest,
    lastSuccess,
    lastBackupTime: lastSuccess?.finishedAt || lastSuccess?.createdAt || latest?.finishedAt || null,
    nextScheduledBackup: runtime.nextScheduledAt,
    mongoConnection: mongoOk ? 'connected' : 'disconnected',
    recordingsRootExists: recordingsPresent,
    logs: listBackupLogs().slice(0, 20),
  };
}
