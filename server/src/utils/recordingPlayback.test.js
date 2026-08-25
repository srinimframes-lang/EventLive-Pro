import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecordingR2Key,
  isSignedUrlExpired,
  parseByteRange,
  recordingPlaybackStatus,
  recordingLifecycleStatus,
  resolveRecordingPlaybackSource,
  sameOriginRecordingPlayUrl,
  RECORDING_SIGNED_URL_EXPIRES_SEC,
  inspectMp4Init,
  selectPlayableRecordingParts,
  shouldPreferMergedRecording,
  shouldDelegateMissingSourceToRecordingHost,
  candidateRecordingR2Keys,
} from './recordingPlayback.js';

test('buildRecordingR2Key uses recordings/<eventId>/<filename>', () => {
  assert.equal(
    buildRecordingR2Key('aaaaaaaaaaaaaaaaaaaaaaaa', '2026-08-19_04-00-00.mp4'),
    'recordings/aaaaaaaaaaaaaaaaaaaaaaaa/2026-08-19_04-00-00.mp4'
  );
  assert.equal(buildRecordingR2Key('', 'a.mp4'), '');
  assert.equal(buildRecordingR2Key('id', '../secret.mp4'), 'recordings/id/secret.mp4');
});

test('sameOriginRecordingPlayUrl is the player source path', () => {
  assert.equal(
    sameOriginRecordingPlayUrl('https://stream.eventlivepro.com', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
    'https://stream.eventlivepro.com/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording'
  );
  assert.equal(
    sameOriginRecordingPlayUrl('https://stream.eventlivepro.com', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'part1'),
    'https://stream.eventlivepro.com/api/events/aaaaaaaaaaaaaaaaaaaaaaaa/stream/recording?part=part1'
  );
});

test('recordingPlaybackStatus: completed VOD is replay, not reconnecting', () => {
  assert.equal(
    recordingPlaybackStatus({
      isLive: false,
      reconnecting: false,
      hasRecording: true,
      publiclyVisible: true,
    }),
    'replay'
  );
  assert.equal(
    recordingPlaybackStatus({
      isLive: true,
      reconnecting: true,
      hasRecording: true,
    }),
    'reconnecting'
  );
  assert.equal(
    recordingPlaybackStatus({
      isLive: false,
      hasRecording: false,
      mergeStatus: 'pending',
    }),
    'processing'
  );
});

test('missing R2 object falls back to local or reports missing', () => {
  const rec = { recordingR2Key: 'recordings/e/a.mp4' };
  const part = { storage: 'r2', r2Key: 'recordings/e/a.mp4' };
  assert.deepEqual(
    resolveRecordingPlaybackSource({
      part,
      rec,
      localExists: false,
      r2Head: { exists: false, size: 0 },
    }),
    { kind: 'missing', r2Key: 'recordings/e/a.mp4', reason: 'r2-missing' }
  );
  assert.equal(
    resolveRecordingPlaybackSource({
      part,
      rec,
      localExists: true,
      r2Head: { exists: false, size: 0 },
    }).kind,
    'local'
  );
  assert.equal(
    resolveRecordingPlaybackSource({
      part,
      rec,
      localExists: false,
      r2Head: { exists: true, size: 99 },
    }).kind,
    'r2'
  );
  assert.equal(
    resolveRecordingPlaybackSource({
      part: { storage: 'local', filename: 'clip.mp4', r2Key: '' },
      rec,
      localExists: false,
      r2Head: { exists: true, size: 400000000 },
      r2Key: 'recordings/e/clip.mp4',
    }).kind,
    'r2'
  );
});

test('inspectMp4Init detects H.264 video vs audio-only merged files', () => {
  function box(type, payload) {
    const p = Buffer.from(payload);
    const b = Buffer.alloc(8 + p.length);
    b.writeUInt32BE(8 + p.length, 0);
    b.write(type, 4, 4, 'ascii');
    p.copy(b, 8);
    return b;
  }
  function hdlr(handler) {
    const payload = Buffer.alloc(24);
    payload.write(handler, 8, 4, 'ascii');
    return box('hdlr', payload);
  }
  function stsd(codec) {
    const payload = Buffer.alloc(16);
    payload.writeUInt32BE(1, 4);
    payload.write(codec, 12, 4, 'ascii');
    return box('stsd', payload);
  }

  const audioOnly = Buffer.concat([
    box('ftyp', Buffer.from('isom')),
    box('moov', Buffer.concat([hdlr('soun'), stsd('mp4a')])),
  ]);
  const audio = inspectMp4Init(audioOnly);
  assert.equal(audio.hasAudio, true);
  assert.equal(audio.hasVideo, false);
  assert.equal(audio.browserPlayable, false);
  assert.equal(audio.audioCodec, 'mp4a');

  const avc = Buffer.concat([
    box('ftyp', Buffer.from('isom')),
    box('moov', Buffer.concat([hdlr('vide'), stsd('avc1'), hdlr('soun'), stsd('mp4a')])),
  ]);
  const video = inspectMp4Init(avc);
  assert.equal(video.hasVideo, true);
  assert.equal(video.videoCodec, 'avc1');
  assert.equal(video.browserPlayable, true);
});

test('selectPlayableRecordingParts falls back from unplayable merged MP4', () => {
  const merged = { filename: 'merged_1.mp4', _id: 'm1', sizeBytes: 3512408145 };
  const orig = {
    filename: '2026-08-16_17-21-33-518717.mp4',
    _id: 'o1',
    r2Key: 'recordings/e/a.mp4',
    sizeBytes: 1036137704,
    startedAt: new Date('2026-08-16T17:21:33Z'),
  };
  const tiny = {
    filename: '2026-08-16_14-56-38-687336.mp4',
    _id: 'tiny',
    r2Key: 'recordings/e/tiny.mp4',
    sizeBytes: 2336,
  };
  const parts = selectPlayableRecordingParts({
    active: [merged],
    all: [tiny, orig, merged],
    inspect: { hasVideo: false, browserPlayable: false, incomplete: false },
    existingIds: new Set(['o1', orig.r2Key]),
  });
  assert.equal(parts.length, 1);
  assert.equal(parts[0]._id, 'o1');

  const keepMerged = selectPlayableRecordingParts({
    active: [merged],
    all: [orig, merged],
    inspect: { hasVideo: true, videoCodec: 'avc1', browserPlayable: true },
    existingIds: new Set([orig.r2Key]),
  });
  assert.equal(keepMerged[0]._id, 'm1');

  const largeMoovPrefersMerged = selectPlayableRecordingParts({
    active: [merged],
    all: [orig, merged],
    inspect: { incomplete: true, browserPlayable: false, hasVideo: true, videoCodec: 'avc1', moovSize: 26402771 },
    existingIds: new Set(['o1', orig.r2Key]),
  });
  assert.equal(largeMoovPrefersMerged[0]._id, 'm1');

  const incompleteNoProofPrefersMerged = selectPlayableRecordingParts({
    active: [{ ...merged, storage: 'r2', r2Key: 'recordings/e/merged_1.mp4' }],
    all: [orig, merged],
    inspect: { incomplete: true, browserPlayable: false },
    existingIds: new Set(['o1', orig.r2Key]),
  });
  assert.equal(incompleteNoProofPrefersMerged[0]._id, 'm1');
});

test('unplayable merged plus restored originals prefers originals (production Prudhvi shape)', () => {
  const merged = {
    filename: 'merged_1786916022256.mp4',
    _id: '6a822cbe737c776ca64e206d',
    sizeBytes: 3512408145,
    startedAt: new Date('2026-08-16T14:56:38.687Z'),
  };
  const orig = {
    filename: '2026-08-16_18-26-15-800755.mp4',
    _id: '6a8201ab737c776ca64e0ee6',
    r2Key: 'recordings/6a81adf1ce2dbab2249f08cd/2026-08-16_18-26-15-800755.mp4',
    localPath: '/root/EventLive-Pro/recordings/6a81adf1ce2dbab2249f08cd/2026-08-16_18-26-15-800755.mp4',
    sizeBytes: 400000000,
    startedAt: new Date('2026-08-16T18:26:15.800Z'),
  };
  const parts = selectPlayableRecordingParts({
    active: [merged, orig],
    all: [merged, orig],
    inspect: { hasVideo: false, hasAudio: true, audioCodec: 'mp4a', browserPlayable: false },
    existingIds: new Set([orig._id, orig.r2Key, orig.localPath, orig.filename]),
  });
  assert.equal(parts.length, 1);
  assert.equal(parts[0]._id, orig._id);
  assert.equal(parts[0].filename, orig.filename);

  const noOriginals = selectPlayableRecordingParts({
    active: [merged],
    all: [merged],
    inspect: { hasVideo: false, hasAudio: true, audioCodec: 'mp4a', browserPlayable: false, incomplete: false },
    existingIds: new Set(),
  });
  assert.equal(noOriginals.length, 0);
});

test('candidateRecordingR2Keys includes filename key when storage is local', () => {
  const keys = candidateRecordingR2Keys({
    eventId: '6a81adf1ce2dbab2249f08cd',
    part: {
      storage: 'local',
      filename: '2026-08-16_18-26-15-800755.mp4',
      r2Key: '',
    },
    rec: { recordingR2Key: 'recordings/6a81adf1ce2dbab2249f08cd/merged_1786916022256.mp4' },
  });
  assert.deepEqual(keys, [
    'recordings/6a81adf1ce2dbab2249f08cd/2026-08-16_18-26-15-800755.mp4',
  ]);
  assert.equal(
    keys.includes('recordings/6a81adf1ce2dbab2249f08cd/merged_1786916022256.mp4'),
    false
  );
});

test('HTTP Range requests: 206 partial and 416 unsatisfiable', () => {
  const full = parseByteRange('', 1000);
  assert.equal(full.status, 200);
  assert.equal(full.contentLength, 1000);

  const mid = parseByteRange('bytes=100-199', 1000);
  assert.equal(mid.status, 206);
  assert.equal(mid.start, 100);
  assert.equal(mid.end, 199);
  assert.equal(mid.contentLength, 100);
  assert.equal(mid.contentRange, 'bytes 100-199/1000');

  const tail = parseByteRange('bytes=500-', 1000);
  assert.equal(tail.status, 206);
  assert.equal(tail.start, 500);
  assert.equal(tail.end, 999);

  const suffix = parseByteRange('bytes=-200', 1000);
  assert.equal(suffix.start, 800);
  assert.equal(suffix.end, 999);

  const bad = parseByteRange('bytes=5000-6000', 1000);
  assert.equal(bad.status, 416);
  assert.equal(bad.contentRange, 'bytes */1000');
});

test('expired signed URL is detected from X-Amz-Expires', () => {
  const url =
    'https://bucket.r2.cloudflarestorage.com/recordings/e/a.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260820T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc';
  assert.equal(isSignedUrlExpired(url, { now: Date.parse('2026-08-20T00:30:00Z') }), false);
  assert.equal(isSignedUrlExpired(url, { now: Date.parse('2026-08-20T01:00:01Z') }), true);
  assert.equal(isSignedUrlExpired('/api/events/e/stream/recording'), false);
  assert.equal(RECORDING_SIGNED_URL_EXPIRES_SEC, 24 * 3600);
});

test('shouldPreferMergedRecording: valid H.264 and large-moov incomplete prefer R2', () => {
  assert.equal(
    shouldPreferMergedRecording({ browserPlayable: true, hasVideo: true, videoCodec: 'avc1' }),
    true
  );
  assert.equal(
    shouldPreferMergedRecording({
      incomplete: true,
      browserPlayable: false,
      hasVideo: true,
      videoCodec: 'avc1',
      moovSize: 18648421,
      ftypBrands: ['isom', 'iso2', 'avc1', 'mp41'],
    }),
    true
  );
  assert.equal(
    shouldPreferMergedRecording({
      incomplete: false,
      hasVideo: false,
      hasAudio: true,
      audioCodec: 'mp4a',
      browserPlayable: false,
    }),
    false
  );
});

test('stale localPath without R2 key must not be delegated to the VPS', () => {
  assert.equal(
    shouldDelegateMissingSourceToRecordingHost({ sourceKind: 'missing', r2Key: '' }),
    false
  );
  assert.equal(
    shouldDelegateMissingSourceToRecordingHost({
      sourceKind: 'missing',
      r2Key: 'recordings/e/merged_1.mp4',
    }),
    true
  );
});

test('audio-only merged is not ready; valid recording is ready/replay', () => {
  assert.equal(
    recordingLifecycleStatus({
      isLive: false,
      hasRecording: true,
      publiclyVisible: true,
      mergeStatus: 'merged',
      storage: 'r2',
      playable: false,
    }),
    'unavailable'
  );
  assert.equal(
    recordingLifecycleStatus({
      isLive: false,
      hasRecording: true,
      publiclyVisible: true,
      mergeStatus: 'merged',
      storage: 'r2',
      playable: true,
    }),
    'ready'
  );
  assert.equal(
    recordingPlaybackStatus({
      isLive: false,
      hasRecording: true,
      publiclyVisible: true,
      playable: true,
    }),
    'replay'
  );
  assert.equal(recordingLifecycleStatus({ isLive: false, mergeStatus: 'pending' }), 'finalizing');
  assert.equal(recordingLifecycleStatus({ isLive: false, mergeStatus: 'uploading' }), 'uploading');
  assert.equal(
    recordingLifecycleStatus({ isLive: false, mergeStatus: 'failed', playable: false }),
    'failed'
  );
});

