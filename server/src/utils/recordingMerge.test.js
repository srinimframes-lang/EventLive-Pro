import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { finalRecordingKey, freeDiskBytes, hasReadyFinalRecording } from './recordingMerge.js';

test('finalRecordingKey uses dedicated final/ prefix', () => {
  assert.equal(
    finalRecordingKey('abc123'),
    'recordings/abc123/final/full-event.mp4'
  );
});

test('hasReadyFinalRecording requires status ready + key', () => {
  assert.equal(hasReadyFinalRecording({ finalRecordingStatus: 'ready', finalRecordingR2Key: 'k' }), true);
  assert.equal(hasReadyFinalRecording({ finalRecordingStatus: 'failed', finalRecordingR2Key: 'k' }), false);
  assert.equal(hasReadyFinalRecording({ finalRecordingStatus: 'ready', finalRecordingR2Key: '' }), false);
});

test('freeDiskBytes returns a positive number on this host', () => {
  const free = freeDiskBytes(os.tmpdir());
  assert.ok(free === null || free > 0);
});

test('ffmpeg concat -c copy works for two compatible mp4s', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elp-concat-'));
  const a = path.join(dir, 'a.mp4');
  const b = path.join(dir, 'b.mp4');
  const out = path.join(dir, 'out.mp4');
  const list = path.join(dir, 'list.txt');

  // Generate two tiny silent H264/AAC clips with the same params.
  for (const [file, color] of [
    [a, 'blue'],
    [b, 'red'],
  ]) {
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}:s=320x240:d=1`,
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=stereo',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        file,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(r.status, 0, r.stderr?.slice(-300));
  }

  fs.writeFileSync(list, `file '${a}'\nfile '${b}'\n`);
  const merge = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out],
    { encoding: 'utf8' }
  );
  assert.equal(merge.status, 0, merge.stderr?.slice(-400));
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 0);

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', out],
    { encoding: 'utf8' }
  );
  const dur = Number(JSON.parse(probe.stdout || '{}').format?.duration || 0);
  assert.ok(dur >= 1.5 && dur <= 3, `unexpected duration ${dur}`);

  fs.rmSync(dir, { recursive: true, force: true });
});
