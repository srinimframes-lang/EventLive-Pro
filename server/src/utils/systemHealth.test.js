import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listHealthLogs, pushHealthLog, isRestartEnabled } from './systemHealth.js';

describe('systemHealth logs', () => {
  it('stores and returns recent log rows', () => {
    const row = pushHealthLog({
      level: 'warning',
      message: 'unit-test-log',
      reason: 'test',
      fix: 'n/a',
      source: 'unit',
    });
    assert.equal(row.message, 'unit-test-log');
    const all = listHealthLogs();
    assert.ok(all.some((e) => e.message === 'unit-test-log'));
    const warnings = listHealthLogs({ level: 'warning' });
    assert.ok(warnings.every((e) => e.level === 'warning'));
  });

  it('reports restart gate as boolean', () => {
    assert.equal(typeof isRestartEnabled(), 'boolean');
  });
});
