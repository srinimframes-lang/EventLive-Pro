import fs from 'fs';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  buildBackupStatus,
  listBackups,
  getBackupById,
  runBackup,
  getDownloadTarget,
  restoreBackup,
  listBackupLogs,
  resolveLocalBackupPath,
} from '../utils/backup.js';

/**
 * @route GET /api/admin/backups/status
 */
export const getBackupStatus = asyncHandler(async (_req, res) => {
  const data = await buildBackupStatus();
  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/admin/backups
 */
export const getBackups = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const data = await listBackups({ limit });
  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/admin/backups/logs
 */
export const getBackupLogs = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, data: listBackupLogs() });
});

/**
 * @route POST /api/admin/backups/run
 */
export const postRunBackup = asyncHandler(async (req, res) => {
  const getIo = () => req.app.get('io');
  const result = await runBackup({ trigger: 'manual', getIo });
  res.status(result.ok ? 200 : 500).json({
    success: result.ok,
    data: result.data || null,
    message: result.message || (result.ok ? 'Backup completed' : 'Backup failed'),
  });
});

/**
 * @route GET /api/admin/backups/:id/download
 */
export const downloadBackup = asyncHandler(async (req, res) => {
  const doc = await getBackupById(req.params.id);
  if (!doc) {
    res.status(404);
    throw new Error('Backup not found');
  }
  const target = await getDownloadTarget(doc);
  if (!target) {
    res.status(404);
    throw new Error('Backup archive not available');
  }
  if (target.type === 'r2') {
    return res.redirect(target.url);
  }
  res.download(target.path, target.filename);
});

/**
 * @route POST /api/admin/backups/:id/restore
 * body: { confirm: true, restoreRecordings?: boolean }
 */
export const postRestoreBackup = asyncHandler(async (req, res) => {
  if (req.body?.confirm !== true && req.body?.confirm !== 'true') {
    res.status(400);
    throw new Error('Restore requires confirm: true');
  }
  const doc = await getBackupById(req.params.id);
  if (!doc) {
    res.status(404);
    throw new Error('Backup not found');
  }
  if (!resolveLocalBackupPath(doc) && !doc.r2Key) {
    res.status(404);
    throw new Error('No archive available to restore');
  }
  const getIo = () => req.app.get('io');
  const result = await restoreBackup(doc, {
    restoreRecordings: req.body?.restoreRecordings !== false,
    getIo,
  });
  res.status(200).json({ success: true, data: result });
});

/**
 * @route DELETE /api/admin/backups/:id
 * Removes metadata + local zip (does not delete R2 object unless ?purgeR2=true later).
 */
export const deleteBackup = asyncHandler(async (req, res) => {
  const doc = await getBackupById(req.params.id);
  if (!doc) {
    res.status(404);
    throw new Error('Backup not found');
  }
  const local = resolveLocalBackupPath(doc);
  if (local) {
    try {
      fs.unlinkSync(local);
    } catch {
      /* ignore */
    }
  }
  await doc.deleteOne();
  res.status(200).json({ success: true, data: { deleted: true, backupId: doc.backupId } });
});
