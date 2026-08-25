import assert from 'node:assert/strict';
import test from 'node:test';
import {
  concatInputsNeedReencode,
  isFfprobeMergedVideoOk,
  isQuarantineRecordingBlip,
  isValidatedMergedOutput,
  mayDeleteOriginalsAfterValidatedMerge,
  selectConcatVideoInputs,
} from './mergeRecordingsLogic.js';

test('tiny 2-3s audio-only connection blip is quarantined and not concat input #1', () => {
  const blip = {
    hasVideo: false,
    hasAudio: true,
    sizeBytes: 2336,
    durationSec: 3,
    videoCodec: '',
    audioCodec: 'aac',
    file: 'blip.mp4',
  };
  const video = {
    hasVideo: true,
    hasAudio: true,
    sizeBytes: 1036137704,
    durationSec: 3862,
    videoCodec: 'h264',
    audioCodec: 'aac',
    file: 'main.mp4',
  };
  assert.equal(isQuarantineRecordingBlip(blip), true);
  assert.equal(isQuarantineRecordingBlip(video), false);
  const inputs = selectConcatVideoInputs([blip, video]);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].file, 'main.mp4');
});

test('audio-only first segment + later H.264 segments keeps only video files', () => {
  const inputs = selectConcatVideoInputs([
    { hasVideo: false, sizeBytes: 2336, durationSec: 3, file: 'a.mp4' },
    { hasVideo: true, videoCodec: 'h264', sizeBytes: 5e8, durationSec: 600, file: 'b.mp4' },
    { hasVideo: true, videoCodec: 'h264', sizeBytes: 8e8, durationSec: 1200, file: 'c.mp4' },
  ]);
  assert.deepEqual(inputs.map((r) => r.file), ['b.mp4', 'c.mp4']);
  assert.equal(concatInputsNeedReencode(inputs), false);
});

test('incompatible video codecs require re-encode instead of audio-only copy', () => {
  assert.equal(
    concatInputsNeedReencode([
      { hasVideo: true, videoCodec: 'h264' },
      { hasVideo: true, videoCodec: 'hevc' },
    ]),
    true
  );
  assert.equal(
    concatInputsNeedReencode([
      { hasVideo: true, videoCodec: 'h264' },
      { hasVideo: true, videoCodec: 'avc1' },
    ]),
    false
  );
});

test('invalid merged MP4 blocks original deletion', () => {
  assert.equal(isFfprobeMergedVideoOk({ hasVideo: false, videoCodec: 'aac' }), false);
  assert.equal(isFfprobeMergedVideoOk({ hasVideo: true, videoCodec: 'h264' }), true);
  assert.equal(
    isValidatedMergedOutput(
      { incomplete: false, hasVideo: false, hasAudio: true, videoCodec: '', durationSec: 89791 },
      { hasVideo: false, videoCodec: '' }
    ),
    false
  );
  const blocked = mayDeleteOriginalsAfterValidatedMerge({
    validated: false,
    r2Head: { exists: true, size: 100 },
    expectedSize: 100,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'merge-unvalidated');
});

test('successful validated merge may clean originals only after R2 HEAD size match', () => {
  assert.equal(
    isValidatedMergedOutput(
      { incomplete: false, hasVideo: true, videoCodec: 'avc1', durationSec: 575 },
      { hasVideo: true, videoCodec: 'h264', durationSec: 575 }
    ),
    true
  );
  const ok = mayDeleteOriginalsAfterValidatedMerge({
    validated: true,
    r2Head: { exists: true, size: 5171541 },
    expectedSize: 5171541,
  });
  assert.equal(ok.ok, true);
  assert.equal(
    mayDeleteOriginalsAfterValidatedMerge({
      validated: true,
      r2Head: { exists: true, size: 1 },
      expectedSize: 5171541,
    }).ok,
    false
  );
});
