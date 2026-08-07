import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextScheduledAt,
  backupScheduleHourUtc,
  isBackupEnabled,
  BACKUP_KEEP_COUNT,
  pushBackupLog,
  listBackupLogs,
} from './backup.js';

describe('backup schedule', () => {
  it('computes next scheduled time after the daily hour UTC', () => {
    const hour = backupScheduleHourUtc();
    const before = new Date(Date.UTC(2026, 7, 7, hour, 0, 0));
    // exactly at hour → next day
    const next = computeNextScheduledAt(before);
    assert.equal(next.getUTCHours(), hour);
    assert.ok(next.getTime() > before.getTime());
  });

  it('keeps at least 1 backup in retention', () => {
    assert.ok(BACKUP_KEEP_COUNT >= 1);
  });

  it('reports enabled flag as boolean', () => {
    assert.equal(typeof isBackupEnabled(), 'boolean');
  });
});

describe('backup logs', () => {
  it('stores ring entries', () => {
    pushBackupLog({ level: 'info', message: 'unit-backup-log' });
    assert.ok(listBackupLogs().some((e) => e.message === 'unit-backup-log'));
  });
});
