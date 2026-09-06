import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-cf-yt-video-unit';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-cloudflare-stream-token';
process.env.CF_YT_VIDEO_FORWARD_PID_DIR = path.join(
  os.tmpdir(),
  `elp-cf-yt-video-test-${process.pid}`
);

const ANIL_INPUT = 'f175154f728840ce4408e98c13c24302';
const OTHER_INPUT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const HLS = 'https://customer-test.cloudflarestream.com/manifest/video.m3u8';
const YT_KEY = 'yt-video-only-key-123';

const {
  isCloudflareYoutubeVideoForwardCandidate,
  buildCloudflareYoutubeVideoOnlyFfmpegArgs,
  ffmpegArgsAreVideoOnly,
  redactForwardSecrets,
  resolveFfmpegBin,
  runCloudflareYoutubeVideoForwardTick,
  resetCloudflareYoutubeVideoForwardState,
  getActiveCloudflareYoutubeVideoForwards,
} = await import('./cloudflareYoutubeVideoForward.js');

function cfEvent(overrides = {}) {
  return {
    _id: 'cccccccccccccccccccccccc',
    liveIngestProvider: 'cloudflare_stream',
    cfStreamLiveInputId: OTHER_INPUT,
    cfStreamHlsUrl: HLS,
    youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeStreamKey: YT_KEY,
    streamDisabled: false,
    ...overrides,
  };
}

function fakeChild(pid = 4242, { exitCode = null, signalCode = null } = {}) {
  return {
    pid,
    exitCode,
    signalCode,
    stderr: { on() {} },
    on() {},
    kill() {},
  };
}

test('resolveFfmpegBin prefers FFMPEG_PATH over ffmpeg-static', () => {
  const previous = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = path.join('custom', 'ffmpeg-override');
  try {
    assert.equal(resolveFfmpegBin(), path.join('custom', 'ffmpeg-override'));
  } finally {
    if (previous === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = previous;
  }
});

test('resolveFfmpegBin uses ffmpeg-static when FFMPEG_PATH is unset', () => {
  const previous = process.env.FFMPEG_PATH;
  delete process.env.FFMPEG_PATH;
  try {
    const bin = resolveFfmpegBin();
    assert.notEqual(bin, 'ffmpeg');
    assert.match(bin.replace(/\\/g, '/'), /node_modules\/ffmpeg-static\//);
    assert.equal(fs.existsSync(bin), true);
  } finally {
    if (previous === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = previous;
  }
});

test('candidate requires Cloudflare ingest, HLS, YouTube key, and skips Anil Geetha', () => {
  assert.equal(isCloudflareYoutubeVideoForwardCandidate(cfEvent()), true);
  assert.equal(
    isCloudflareYoutubeVideoForwardCandidate(cfEvent({ liveIngestProvider: 'mediamtx' })),
    false
  );
  assert.equal(
    isCloudflareYoutubeVideoForwardCandidate(cfEvent({ youtubeStreamKey: '' })),
    false
  );
  assert.equal(
    isCloudflareYoutubeVideoForwardCandidate(cfEvent({ cfStreamLiveInputId: ANIL_INPUT })),
    false
  );
  assert.equal(
    isCloudflareYoutubeVideoForwardCandidate(cfEvent({ streamDisabled: true })),
    false
  );
});

test('ffmpeg args are video-only: map video, drop audio, never encode AAC', () => {
  const args = buildCloudflareYoutubeVideoOnlyFfmpegArgs({
    hlsUrl: HLS,
    rtmpTarget: `rtmp://a.rtmp.youtube.com/live2/${YT_KEY}`,
  });
  assert.equal(ffmpegArgsAreVideoOnly(args), true);
  assert.ok(args.includes('-an'));
  assert.ok(args.includes('0:v:0'));
  assert.equal(args.includes('-c:a'), false);
  assert.equal(args.includes('aac'), false);
  assert.equal(args.includes('anullsrc'), false);
  assert.equal(args.includes('lavfi'), false);
  assert.equal(args[args.length - 1].endsWith(YT_KEY), true);
});

test('redactForwardSecrets never leaves the stream key in log text', () => {
  const raw = `Failed to publish rtmp://a.rtmp.youtube.com/live2/${YT_KEY}`;
  const out = redactForwardSecrets(raw, [YT_KEY, `rtmp://a.rtmp.youtube.com/live2/${YT_KEY}`]);
  assert.equal(out.includes(YT_KEY), false);
  assert.match(out, /\[redacted\]/);
});

test('tick starts ffmpeg while Cloudflare is publishing and does not spawn twice', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const spawned = [];
  const deps = {
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: true, status: 'connected' }),
    spawn: (bin, args) => {
      spawned.push({ bin, args });
      return fakeChild(9001);
    },
    killFn() {},
  };
  const first = await runCloudflareYoutubeVideoForwardTick(deps);
  const second = await runCloudflareYoutubeVideoForwardTick(deps);
  assert.equal(first.skipped, false);
  assert.equal(spawned.length, 1);
  assert.equal(ffmpegArgsAreVideoOnly(spawned[0].args), true);
  assert.equal(JSON.stringify(first).includes(YT_KEY), false);
  assert.equal(getActiveCloudflareYoutubeVideoForwards().length, 1);
  assert.equal(second.results[0].action, 'already_running');
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test('tick does not start MediaMTX or Anil Geetha events', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const spawned = [];
  await runCloudflareYoutubeVideoForwardTick({
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [
      cfEvent({ liveIngestProvider: 'mediamtx', _id: '111111111111111111111111' }),
      cfEvent({ cfStreamLiveInputId: ANIL_INPUT, _id: '6a927f90ff163d32dba6654d' }),
    ],
    getLiveInputStatus: async () => ({ isPublishing: true }),
    spawn: (bin, args) => {
      spawned.push({ bin, args });
      return fakeChild();
    },
    killFn() {},
  });
  assert.equal(spawned.length, 0);
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test('tick stops ffmpeg when Cloudflare goes offline', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const killed = [];
  const child = fakeChild(9002);
  child.kill = () => killed.push(9002);
  await runCloudflareYoutubeVideoForwardTick({
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: true }),
    spawn: () => child,
    killFn() {},
  });
  const stopped = await runCloudflareYoutubeVideoForwardTick({
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: false, status: 'disconnected' }),
    spawn: () => fakeChild(1),
    killFn() {},
  });
  assert.equal(stopped.results.some((r) => r.action === 'stopped'), true);
  assert.equal(killed.includes(9002), true);
  assert.equal(getActiveCloudflareYoutubeVideoForwards().length, 0);
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test('running child is not respawned even when kill(0) reports dead', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const spawned = [];
  const child = fakeChild(9101);
  const deps = {
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: true, status: 'connected' }),
    spawn: () => {
      spawned.push(child);
      return child;
    },
    killFn() {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    },
  };
  const first = await runCloudflareYoutubeVideoForwardTick(deps);
  const second = await runCloudflareYoutubeVideoForwardTick(deps);
  assert.equal(first.results[0].action, 'started');
  assert.equal(second.results[0].action, 'already_running');
  assert.equal(second.results[0].pid, 9101);
  assert.equal(spawned.length, 1);
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test('exited child is replaced on the next publishing tick', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const spawned = [];
  const firstChild = fakeChild(9102);
  const secondChild = fakeChild(9103);
  const deps = {
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: true, status: 'connected' }),
    spawn: () => {
      const next = spawned.length === 0 ? firstChild : secondChild;
      spawned.push(next);
      return next;
    },
    killFn() {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    },
  };
  const first = await runCloudflareYoutubeVideoForwardTick(deps);
  firstChild.exitCode = 1;
  const second = await runCloudflareYoutubeVideoForwardTick(deps);
  assert.equal(first.results[0].action, 'started');
  assert.equal(first.results[0].pid, 9102);
  assert.equal(second.results[0].action, 'started');
  assert.equal(second.results[0].pid, 9103);
  assert.equal(spawned.length, 2);
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test('pid-file recovery still adopts a live pid without a ChildProcess handle', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const event = cfEvent();
  const recoveredPid = 9104;
  const pidFile = path.join(process.env.CF_YT_VIDEO_FORWARD_PID_DIR, `${event._id}.pid`);
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(recoveredPid), { encoding: 'utf8' });
  const spawned = [];
  const out = await runCloudflareYoutubeVideoForwardTick({
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [event],
    getLiveInputStatus: async () => ({ isPublishing: true, status: 'connected' }),
    spawn: () => {
      spawned.push(true);
      return fakeChild(1);
    },
    killFn(pid, signal) {
      if (pid === recoveredPid && signal === 0) return;
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    },
  });
  assert.equal(out.results[0].action, 'adopted');
  assert.equal(out.results[0].pid, recoveredPid);
  assert.equal(spawned.length, 0);
  assert.equal(getActiveCloudflareYoutubeVideoForwards()[0]?.pid, recoveredPid);
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test('tick is idle when ffmpeg is missing', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const spawned = [];
  const out = await runCloudflareYoutubeVideoForwardTick({
    ffmpegAvailable: false,
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: true }),
    spawn: () => {
      spawned.push(true);
      return fakeChild();
    },
  });
  assert.equal(out.reason, 'ffmpeg_missing');
  assert.equal(spawned.length, 0);
});

test('ffmpeg exit and error logs include code/signal and redact the stream key', async () => {
  resetCloudflareYoutubeVideoForwardState();
  const listeners = {};
  const stderrListeners = {};
  await runCloudflareYoutubeVideoForwardTick({
    ffmpegAvailable: true,
    ffmpegBin: 'ffmpeg',
    listEvents: async () => [cfEvent()],
    getLiveInputStatus: async () => ({ isPublishing: true }),
    spawn: () => ({
      pid: 9100,
      stderr: {
        on(event, fn) {
          stderrListeners[event] = fn;
        },
      },
      on(event, fn) {
        listeners[event] = fn;
      },
      kill() {},
    }),
    killFn() {},
  });
  assert.equal(typeof listeners.exit, 'function');
  assert.equal(typeof listeners.error, 'function');

  const infos = [];
  const originalInfo = console.info;
  console.info = (...args) => {
    infos.push(
      args
        .map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ')
    );
  };
  try {
    stderrListeners.data?.(
      `Connection to rtmp://a.rtmp.youtube.com/live2/${YT_KEY} failed`
    );
    listeners.error?.(new Error(`EPIPE rtmp://a.rtmp.youtube.com/live2/${YT_KEY}`));
    listeners.exit?.(1, null);
  } finally {
    console.info = originalInfo;
  }

  const joined = infos.join('\n');
  assert.match(joined, /ffmpeg error/);
  assert.match(joined, /ffmpeg exited/);
  assert.match(joined, /"code":1/);
  assert.equal(joined.includes(YT_KEY), false);
  assert.match(joined, /\[redacted\]/);
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
});

test.after(() => {
  resetCloudflareYoutubeVideoForwardState({ killFn() {} });
  try {
    fs.rmSync(process.env.CF_YT_VIDEO_FORWARD_PID_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
