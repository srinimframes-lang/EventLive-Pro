import mongoose from 'mongoose';

/**
 * Metadata for platform backup archives (MongoDB + local recordings).
 * Does not store stream keys or live state — diagnostics / recovery only.
 */
const backupSchema = new mongoose.Schema(
  {
    backupId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ['schedule', 'manual'],
      default: 'schedule',
      index: true,
    },
    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'failed'],
      default: 'running',
      index: true,
    },
    startedAt: { type: Date, default: Date.now, index: true },
    finishedAt: { type: Date },
    durationMs: { type: Number, default: 0, min: 0 },
    sizeBytes: { type: Number, default: 0, min: 0 },
    localPath: { type: String, trim: true, default: '' },
    localFilename: { type: String, trim: true, default: '' },
    r2Key: { type: String, trim: true, default: '' },
    r2Uploaded: { type: Boolean, default: false },
    mongoStatus: {
      type: String,
      enum: ['pending', 'ok', 'skipped', 'failed'],
      default: 'pending',
    },
    mongoMethod: { type: String, trim: true, default: '' }, // mongodump | json-export
    mongoDetail: { type: String, trim: true, default: '' },
    recordingsStatus: {
      type: String,
      enum: ['pending', 'ok', 'skipped', 'partial', 'failed'],
      default: 'pending',
    },
    recordingsFileCount: { type: Number, default: 0, min: 0 },
    recordingsSkippedLive: { type: Number, default: 0, min: 0 },
    recordingsDetail: { type: String, trim: true, default: '' },
    error: { type: String, trim: true, default: '' },
    retries: { type: Number, default: 0, min: 0 },
    notifySent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

backupSchema.index({ createdAt: -1 });
backupSchema.index({ status: 1, createdAt: -1 });

export const Backup = mongoose.model('Backup', backupSchema);
