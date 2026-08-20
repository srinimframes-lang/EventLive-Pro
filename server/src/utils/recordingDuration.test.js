import assert from 'node:assert/strict';
import test from 'node:test';
import {
  durationFromTimestamps,
  isImplausiblyShortVersusTimestamps,
  looksLikeSegmentCeilingDuration,
  parseMediaMtxDurationToSec,
  partTrustedDurationSec,
  pickPlayerDurationSec,
  resolveTrustedDurationSec,
} from './recordingDuration.js';

test('parseMediaMtxDurationToSec reads Go duration strings', () => {
  assert.equal(parseMediaMtxDurationToSec('6h2m3s'), 6 * 3600 + 2 * 60 + 3);
  assert.equal(parseMediaMtxDurationToSec('24h56m31s'), 24 * 3600 + 56 * 60 + 31);
  assert.equal(parseMediaMtxDurationToSec('21600'), 21600);
  assert.equal(parseMediaMtxDurationToSec(21600.4), 21600);
  assert.equal(parseMediaMtxDurationToSec('6h2m'), 6 * 3600 + 120);
  assert.equal(parseMediaMtxDurationToSec(''), 0);
});

test('looksLikeSegmentCeilingDuration catches 24:56:31 fMP4 stamp', () => {
  assert.equal(looksLikeSegmentCeilingDuration(86400), true);
  assert.equal(looksLikeSegmentCeilingDuration(24 * 3600 + 56 * 60 + 31), true);
  assert.equal(looksLikeSegmentCeilingDuration(6 * 3600), false);
  assert.equal(looksLikeSegmentCeilingDuration(0), false);
});

test('resolveTrustedDurationSec prefers timestamps over 24h container/stored', () => {
  const startedAt = new Date('2026-08-19T04:00:00Z');
  const endedAt = new Date('2026-08-19T10:05:00Z');
  const sec = resolveTrustedDurationSec({
    containerDurationSec: 24 * 3600 + 56 * 60 + 31,
    storedDurationSec: 24 * 3600 + 56 * 60 + 31,
    startedAt,
    endedAt,
  });
  assert.equal(sec, 6 * 3600 + 5 * 60);
});

test('resolveTrustedDurationSec does not fabricate when nothing is known', () => {
  assert.equal(resolveTrustedDurationSec({}), 0);
});

test('resolveTrustedDurationSec keeps a real ~6h stored duration', () => {
  assert.equal(
    resolveTrustedDurationSec({
      storedDurationSec: 6 * 3600 + 12,
    }),
    6 * 3600 + 12
  );
});

test('resolveTrustedDurationSec ignores awk-truncated Go duration (6s vs 6h)', () => {
  const startedAt = new Date('2026-08-19T04:00:00Z');
  const endedAt = new Date('2026-08-19T10:00:00Z');
  const sec = resolveTrustedDurationSec({
    storedDurationSec: 6,
    startedAt,
    endedAt,
  });
  assert.equal(sec, 6 * 3600);
  assert.equal(isImplausiblyShortVersusTimestamps(6, 6 * 3600), true);
});

test('resolveTrustedDurationSec prefers file mtime when endedAt is stale', () => {
  const startedAt = new Date('2026-08-19T04:00:00Z');
  const endedAt = new Date('2026-08-20T04:56:31Z');
  const fileMtime = new Date('2026-08-19T10:00:00Z');
  const sec = resolveTrustedDurationSec({
    storedDurationSec: 89791,
    startedAt,
    endedAt,
    fileMtime,
  });
  assert.equal(sec, 6 * 3600);
});

test('pickPlayerDurationSec caps inflated HTML5 duration', () => {
  assert.equal(pickPlayerDurationSec(89791, 6 * 3600), 6 * 3600);
  assert.equal(pickPlayerDurationSec(6 * 3600 + 2, 6 * 3600), 6 * 3600 + 2);
  assert.equal(pickPlayerDurationSec(Infinity, 100), 100);
  assert.equal(pickPlayerDurationSec(NaN, 100), 100);
});

test('existing recording compatibility: legacy 42s without timestamps stays 42s', () => {
  assert.equal(partTrustedDurationSec({ durationSec: 42 }), 42);
  assert.equal(durationFromTimestamps(null, new Date()), 0);
});

test('a real ~24h timestamp span is not replaced with zero', () => {
  const startedAt = new Date('2026-08-19T00:00:00Z');
  const endedAt = new Date('2026-08-20T00:10:00Z');
  const sec = resolveTrustedDurationSec({
    storedDurationSec: 24 * 3600 + 10 * 60,
    startedAt,
    endedAt,
  });
  assert.ok(sec >= 24 * 3600);
});
