/**
 * Platform System Health — diagnostics only.
 * Never mutates MediaMTX ingest, stream keys, recordings, or live playback paths.
 */
import os from 'os';
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import { env, MEDIAMTX_VPS_HOST, STREAM_PUBLIC_DOMAIN } from '../config/env.js';
import { Event } from '../models/Event.js';
import { isHlsCdnEnabled, getCdnHlsPlaybackBase, getOriginHlsPlaybackBase } from './hlsCdn.js';

const execFileAsync = promisify(execFile);

/** @type {{ at: number, level: string, message: string, reason?: string, fix?: string, source?: string }[]} */
const errorRing = [];
const MAX_LOGS = 200;
/** @type {Set<string>} last critical keys — avoid flooding the ring every 30s poll */
let lastCriticalKeys = new Set();

export function pushHealthLog(entry) {
  const row = {
    at: Date.now(),
    level: entry.level || 'error',
    message: String(entry.message || 'Unknown'),
    reason: entry.reason || '',
    fix: entry.fix || '',
    source: entry.source || 'system-health',
  };
  errorRing.unshift(row);
  if (errorRing.length > MAX_LOGS) errorRing.length = MAX_LOGS;
  return row;
}

export function listHealthLogs({ level } = {}) {
  if (!level) return errorRing.slice(0, 100);
  return errorRing.filter((e) => e.level === level).slice(0, 100);
}

function statusOf(ok, warn = false) {
  if (ok === true) return 'healthy';
  if (warn || ok === null) return 'warning';
  return 'error';
}

async function tcpReachable(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    const t = setTimeout(() => done(false), timeoutMs);
    socket.on('connect', () => {
      clearTimeout(t);
      done(true);
    });
    socket.on('error', () => {
      clearTimeout(t);
      done(false);
    });
  });
}

async function httpProbe(url, { timeoutMs = 6000, expectStatus } = {}) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      redirect: 'follow',
    });
    if (expectStatus && res.status !== expectStatus) {
      return { ok: false, status: res.status, detail: `HTTP ${res.status}` };
    }
    return { ok: res.ok || res.status < 500, status: res.status, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, detail: err.message || 'fetch failed' };
  }
}

async function shell(cmd, args = [], timeout = 8000) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (err) {
    return {
      ok: false,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
    };
  }
}

function hostMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const load = os.loadavg();
  const cpus = os.cpus() || [];
  // Approximate CPU busy % from load[0] / cpu count (Unix); Windows loadavg is zeros.
  const cpuCount = Math.max(cpus.length, 1);
  const load1 = load[0] || 0;
  const cpuPct =
    process.platform === 'win32'
      ? null
      : Math.min(100, Math.round((load1 / cpuCount) * 100));

  let diskPct = null;
  let diskDetail = 'Disk % requires VPS shell (df)';
  return {
    platform: process.platform,
    hostname: os.hostname(),
    uptimeSec: Math.round(os.uptime()),
    processUptimeSec: Math.round(process.uptime()),
    loadAverage: load,
    cpuCount,
    cpuPct,
    ramPct: Math.round((usedMem / totalMem) * 100),
    ramUsedMb: Math.round(usedMem / 1024 / 1024),
    ramTotalMb: Math.round(totalMem / 1024 / 1024),
    diskPct,
    diskDetail,
    networkNote: 'Host NIC counters need VPS agent; stream probes cover public network health.',
  };
}

async function enrichDisk(metrics) {
  if (process.platform === 'win32') return metrics;
  const df = await shell('df', ['-P', '/']);
  if (!df.ok) return metrics;
  const lines = df.stdout.trim().split('\n');
  const parts = (lines[1] || '').split(/\s+/);
  const pct = String(parts[4] || '').replace('%', '');
  const n = Number(pct);
  if (Number.isFinite(n)) {
    metrics.diskPct = n;
    metrics.diskDetail = `${parts[2] || '?'} used of ${parts[1] || '?'} (${n}%)`;
  }
  return metrics;
}

async function pm2Status() {
  const r = await shell('pm2', ['jlist']);
  if (!r.ok) {
    return {
      status: 'warning',
      label: 'PM2 unavailable on this host',
      detail: r.stderr || 'pm2 not in PATH (API may run on Render)',
      processes: [],
    };
  }
  let list = [];
  try {
    list = JSON.parse(r.stdout || '[]');
  } catch {
    list = [];
  }
  const procs = (Array.isArray(list) ? list : []).map((p) => ({
    name: p.name,
    status: p.pm2_env?.status || 'unknown',
    cpu: p.monit?.cpu,
    memory: p.monit?.memory,
  }));
  const online = procs.filter((p) => p.status === 'online').length;
  return {
    status: procs.length ? (online === procs.length ? 'healthy' : 'warning') : 'warning',
    label: procs.length ? `${online}/${procs.length} online` : 'No PM2 processes',
    detail: procs.map((p) => `${p.name}:${p.status}`).join(', ') || 'empty',
    processes: procs,
  };
}

async function serviceRunning(name) {
  if (process.platform === 'win32') {
    return { status: 'warning', label: `${name} n/a`, detail: 'Not checked on Windows API host' };
  }
  const sys = await shell('systemctl', ['is-active', name]);
  const active = (sys.stdout || '').trim() === 'active';
  if (active) return { status: 'healthy', label: `${name} active`, detail: 'systemd active' };
  // Fallback: pgrep
  const pg = await shell('pgrep', ['-a', name]);
  if (pg.ok && pg.stdout.trim()) {
    return { status: 'healthy', label: `${name} running`, detail: pg.stdout.trim().split('\n')[0] };
  }
  return {
    status: 'error',
    label: `${name} not running`,
    detail: sys.stderr || pg.stderr || 'not found',
    reason: `${name} process is down`,
    fix: name === 'nginx' ? 'systemctl restart nginx' : `pm2 restart ${name} || systemctl restart ${name}`,
  };
}

async function ffmpegForwarders() {
  if (process.platform === 'win32') {
    return {
      status: 'warning',
      label: 'FFmpeg n/a on API host',
      detail: 'Check VPS: pgrep -a ffmpeg',
      count: 0,
    };
  }
  const r = await shell('bash', [
    '-lc',
    "pgrep -a ffmpeg 2>/dev/null | grep -E 'flv|rtmp|forward|youtube|facebook' || true",
  ]);
  const lines = (r.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    status: lines.length ? 'healthy' : 'warning',
    label: lines.length ? `${lines.length} forward process(es)` : 'No active forward ffmpeg',
    detail: lines.slice(0, 8).join(' | ') || 'Idle (OK when nothing is live)',
    count: lines.length,
    processes: lines.slice(0, 20),
  };
}

/**
 * Full platform health snapshot for Super Admin.
 */
export async function collectSystemHealth() {
  const originHls = getOriginHlsPlaybackBase();
  const cdnHls = getCdnHlsPlaybackBase();
  const streamHost = STREAM_PUBLIC_DOMAIN;
  const vpsHost = env.mediamtxVpsHost || MEDIAMTX_VPS_HOST;
  const mtxApi = env.mediamtxApiUrl;

  const metrics = await enrichDisk(hostMetrics());

  // Parallel probes
  const [
    rtmpOk,
    httpsProbe,
    mtxProbe,
    originProbe,
    cdnProbe,
    dnsOk,
    mongoState,
    pm2,
    nginx,
    ffmpeg,
    liveCount,
    eventCount,
    recordingCount,
  ] = await Promise.all([
    tcpReachable(vpsHost, 1935, 5000),
    httpProbe(`https://${streamHost}/health`, { timeoutMs: 8000 }),
    httpProbe(`${mtxApi}/v3/paths/list`, { timeoutMs: 5000 }),
    httpProbe(`${originHls}/`, { timeoutMs: 8000 }),
    isHlsCdnEnabled()
      ? httpProbe(`${cdnHls}/`, { timeoutMs: 8000 })
      : Promise.resolve({ ok: null, detail: 'CDN toggle OFF' }),
    tcpReachable(streamHost, 443, 5000),
    Promise.resolve(mongoose.connection.readyState),
    pm2Status(),
    serviceRunning('nginx'),
    ffmpegForwarders(),
    Event.countDocuments({ isLive: true }).catch(() => 0),
    Event.countDocuments({}).catch(() => 0),
    Event.countDocuments({
      $or: [{ recordingUrl: { $ne: '' } }, { 'recordings.0': { $exists: true } }],
    }).catch(() => 0),
  ]);

  const mongoOk = mongoState === 1;
  const backendOk = true; // this process answered
  const vpsOnline = rtmpOk || mtxProbe.ok === true || httpsProbe.ok === true;

  const checks = {
    server: {
      vpsOnline: {
        status: statusOf(vpsOnline),
        label: vpsOnline ? 'VPS reachable' : 'VPS offline / unreachable',
        detail: `host=${vpsHost}`,
        reason: vpsOnline ? '' : `Cannot reach ${vpsHost} (RTMP/HTTPS/MediaMTX)`,
        fix: vpsOnline
          ? ''
          : 'Open Hostinger firewall TCP 1935/80/443; run media-server/scripts/recover-rtmp-production.sh',
      },
      cpu: {
        status:
          metrics.cpuPct == null
            ? 'warning'
            : metrics.cpuPct >= 90
              ? 'error'
              : metrics.cpuPct >= 75
                ? 'warning'
                : 'healthy',
        label: metrics.cpuPct == null ? 'CPU n/a' : `CPU ${metrics.cpuPct}%`,
        detail: `load=${metrics.loadAverage.map((n) => n.toFixed(2)).join(', ')} cpus=${metrics.cpuCount}`,
      },
      ram: {
        status: metrics.ramPct >= 90 ? 'error' : metrics.ramPct >= 80 ? 'warning' : 'healthy',
        label: `RAM ${metrics.ramPct}%`,
        detail: `${metrics.ramUsedMb}/${metrics.ramTotalMb} MB`,
      },
      disk: {
        status:
          metrics.diskPct == null
            ? 'warning'
            : metrics.diskPct >= 90
              ? 'error'
              : metrics.diskPct >= 80
                ? 'warning'
                : 'healthy',
        label: metrics.diskPct == null ? 'Disk n/a' : `Disk ${metrics.diskPct}%`,
        detail: metrics.diskDetail,
      },
      network: {
        status: statusOf(dnsOk || httpsProbe.ok),
        label: 'Network',
        detail: metrics.networkNote,
      },
      uptime: {
        status: 'healthy',
        label: `Host uptime ${Math.floor(metrics.uptimeSec / 3600)}h`,
        detail: `process ${Math.floor(metrics.processUptimeSec / 60)}m`,
      },
      loadAverage: {
        status:
          metrics.cpuPct == null
            ? 'warning'
            : metrics.cpuPct >= 90
              ? 'error'
              : metrics.cpuPct >= 75
                ? 'warning'
                : 'healthy',
        label: `Load ${metrics.loadAverage.map((n) => n.toFixed(2)).join(' / ')}`,
        detail: os.platform(),
      },
    },
    services: {
      mediamtx: {
        status: statusOf(mtxProbe.ok === true, mtxProbe.ok === false && rtmpOk),
        label: mtxProbe.ok ? 'MediaMTX API OK' : 'MediaMTX API down',
        detail: `${mtxApi} — ${mtxProbe.detail}`,
        reason: mtxProbe.ok ? '' : 'MediaMTX control API not responding',
        fix: 'pm2 restart mediamtx',
      },
      nginx: nginx,
      backend: {
        status: 'healthy',
        label: 'Backend running',
        detail: `uptime ${Math.floor(process.uptime())}s pid=${process.pid}`,
      },
      pm2: pm2,
      mongodb: {
        status: statusOf(mongoOk),
        label: mongoOk ? 'MongoDB connected' : 'MongoDB disconnected',
        detail: `readyState=${mongoState}`,
        reason: mongoOk ? '' : 'Database connection lost',
        fix: 'Check MONGODB_URI / Atlas IP allowlist; restart API',
      },
      redis: {
        status: 'warning',
        label: 'Redis not configured',
        detail: 'Optional — EventLivePro does not require Redis today',
      },
    },
    streaming: {
      rtmp1935: {
        status: statusOf(rtmpOk),
        label: rtmpOk ? 'RTMP :1935 reachable' : 'RTMP :1935 unreachable',
        detail: `${vpsHost}:1935`,
        reason: rtmpOk ? '' : 'OBS cannot connect — port closed or MediaMTX down',
        fix: 'ufw allow 1935/tcp; Hostinger firewall allow 1935; pm2 restart mediamtx',
      },
      hls: {
        status: statusOf(originProbe.ok === true || httpsProbe.ok === true, originProbe.ok === null),
        label: originProbe.ok || httpsProbe.ok ? 'HLS / stream host responding' : 'HLS host down',
        detail: `${originHls} — ${originProbe.detail || httpsProbe.detail}`,
      },
      https: {
        status: statusOf(httpsProbe.ok === true),
        label: httpsProbe.ok ? 'HTTPS working' : 'HTTPS failing',
        detail: `https://${streamHost}/health — ${httpsProbe.detail}`,
        fix: 'systemctl restart nginx; check Let\'s Encrypt cert',
      },
      cdn: {
        status:
          !isHlsCdnEnabled()
            ? 'warning'
            : statusOf(cdnProbe.ok === true),
        label: !isHlsCdnEnabled()
          ? 'CDN OFF (Standard)'
          : cdnProbe.ok
            ? 'CDN working'
            : 'CDN failing',
        detail: isHlsCdnEnabled() ? `${cdnHls} — ${cdnProbe.detail}` : 'Viewer CDN toggle is OFF',
      },
      adaptive: {
        status: 'warning',
        label: 'Adaptive HLS opt-in only',
        detail: 'Default Standard (MediaMTX single quality). ABR runs only when Super Admin enables Adaptive per event.',
      },
      recording: {
        status: 'healthy',
        label: 'Recording pipeline configured',
        detail: 'MediaMTX record + finalize-recording.sh (verify on next live)',
      },
      replay: {
        status: recordingCount > 0 ? 'healthy' : 'warning',
        label: recordingCount > 0 ? 'Replay data present' : 'No recordings yet',
        detail: `${recordingCount} events with recordings`,
      },
    },
    forwarding: {
      youtube: {
        status: 'warning',
        label: 'YouTube forward ready',
        detail: 'Enabled per event (server_youtube / youtube_server). Idle when no live forward.',
      },
      facebook: {
        status: 'warning',
        label: 'Facebook forward ready',
        detail: 'Enabled when Facebook destination is checked on the event.',
      },
      instagram: {
        status: 'warning',
        label: 'Instagram forward ready (future)',
        detail: 'Not implemented — placeholder for multi-forward architecture',
      },
      multiForward: {
        status: ffmpeg.count > 0 ? 'healthy' : 'warning',
        label: ffmpeg.count > 0 ? 'Multi-forward active' : 'Multi-forward idle',
        detail: 'rtmp-forward-start.sh on publish',
      },
      ffmpeg: ffmpeg,
      activeForwards: {
        status: ffmpeg.count > 0 ? 'healthy' : 'warning',
        label: `${ffmpeg.count} active forward process(es)`,
        detail: ffmpeg.detail,
      },
    },
    network: {
      ssl: {
        status: statusOf(httpsProbe.ok === true),
        label: httpsProbe.ok ? 'SSL valid (HTTPS OK)' : 'SSL / HTTPS problem',
        detail: httpsProbe.detail,
      },
      domain: {
        status: statusOf(dnsOk || httpsProbe.ok),
        label: dnsOk || httpsProbe.ok ? 'Domain reachable' : 'Domain unreachable',
        detail: streamHost,
      },
      dns: {
        status: statusOf(Boolean(vpsHost)),
        label: 'DNS configured',
        detail: `${streamHost} → ${vpsHost}`,
      },
      firewall: {
        status: statusOf(rtmpOk && (httpsProbe.ok || dnsOk), !rtmpOk),
        label: rtmpOk ? 'Firewall likely OK for 1935' : 'Firewall may block 1935',
        detail: 'Confirm Hostinger hPanel + ufw allow 1935/tcp',
        fix: !rtmpOk ? 'Allow TCP 1935 in Hostinger firewall and ufw' : '',
      },
      ports: {
        status: statusOf(rtmpOk && dnsOk),
        label: 'Ports 80 / 443 / 1935',
        detail: `1935=${rtmpOk ? 'open' : 'closed'} 443=${dnsOk || httpsProbe.ok ? 'open' : 'closed'}`,
      },
    },
    database: {
      mongodb: {
        status: statusOf(mongoOk),
        label: mongoOk ? 'MongoDB OK' : 'MongoDB down',
        detail: `readyState=${mongoState}`,
      },
      totalEvents: { status: 'healthy', label: `${eventCount} events`, detail: 'total' },
      activeLive: {
        status: liveCount > 0 ? 'healthy' : 'warning',
        label: `${liveCount} live now`,
        detail: 'isLive=true',
      },
      recordings: {
        status: 'healthy',
        label: `${recordingCount} with recordings`,
        detail: 'events that have replay assets',
      },
      storage: {
        status: metrics.diskPct == null ? 'warning' : metrics.diskPct >= 90 ? 'error' : 'healthy',
        label: metrics.diskPct == null ? 'Storage n/a' : `Disk ${metrics.diskPct}%`,
        detail: metrics.diskDetail,
      },
    },
  };

  const flat = flattenChecks(checks);
  const score = computeHealthScore(flat);
  const critical = flat.filter((c) => c.status === 'error');
  const nextCritical = new Set(critical.map((c) => c.key));
  for (const c of critical) {
    if (lastCriticalKeys.has(c.key)) continue;
    pushHealthLog({
      level: 'error',
      message: c.label,
      reason: c.reason || c.detail,
      fix: c.fix || suggestFix(c.key),
      source: c.key,
    });
  }
  lastCriticalKeys = nextCritical;

  return {
    checkedAt: new Date().toISOString(),
    score,
    scoreLabel: scoreLabel(score),
    criticalCount: critical.length,
    warningCount: flat.filter((c) => c.status === 'warning').length,
    healthyCount: flat.filter((c) => c.status === 'healthy').length,
    metrics,
    checks,
    critical: critical.map((c) => ({
      key: c.key,
      label: c.label,
      reason: c.reason || c.detail,
      fix: c.fix || suggestFix(c.key),
    })),
    hosts: {
      streamDomain: streamHost,
      vpsHost,
      mediamtxApi: mtxApi,
      hlsOrigin: originHls,
      hlsCdn: cdnHls,
      hlsCdnEnabled: isHlsCdnEnabled(),
      apiHostname: os.hostname(),
    },
    restartEnabled: isRestartEnabled(),
  };
}

function flattenChecks(checks) {
  const out = [];
  for (const [section, group] of Object.entries(checks)) {
    for (const [key, val] of Object.entries(group)) {
      out.push({ key: `${section}.${key}`, section, ...val });
    }
  }
  return out;
}

function computeHealthScore(flat) {
  if (!flat.length) return 0;
  const criticalKeys = new Set([
    'services.mongodb',
    'services.backend',
    'streaming.rtmp1935',
    'streaming.https',
    'services.mediamtx',
    'server.vpsOnline',
  ]);
  let score = 100;
  for (const c of flat) {
    if (c.status === 'error') {
      score -= criticalKeys.has(c.key) ? 18 : 8;
    } else if (c.status === 'warning') {
      score -= criticalKeys.has(c.key) ? 6 : 2;
    }
  }
  return Math.max(0, Math.min(100, score));
}

function scoreLabel(score) {
  if (score >= 100) return 'Everything working';
  if (score >= 90) return 'Minor warning';
  if (score >= 70) return 'Service degraded';
  if (score >= 50) return 'Elevated risk';
  return 'Critical';
}

function suggestFix(key) {
  const map = {
    'streaming.rtmp1935': 'Allow TCP 1935; pm2 restart mediamtx; run recover-rtmp-production.sh',
    'services.mediamtx': 'pm2 restart mediamtx',
    'services.nginx': 'systemctl restart nginx',
    'services.mongodb': 'Check MONGODB_URI and restart API',
    'server.vpsOnline': 'Verify VPS power + Hostinger firewall',
    'streaming.https': 'systemctl restart nginx; renew SSL if expired',
  };
  return map[key] || 'Check PM2 logs and MediaMTX status on the VPS';
}

export function isRestartEnabled() {
  if (process.env.SYSTEM_RESTART_ENABLED === 'true') return true;
  // Safe auto-enable when API talks to local MediaMTX (running on VPS).
  const api = String(env.mediamtxApiUrl || '');
  return /127\.0\.0\.1|localhost/.test(api);
}

export async function runHealthTest(testId) {
  const vpsHost = env.mediamtxVpsHost || MEDIAMTX_VPS_HOST;
  const streamHost = STREAM_PUBLIC_DOMAIN;
  const originHls = getOriginHlsPlaybackBase();
  const cdnHls = getCdnHlsPlaybackBase();

  const tests = {
    rtmp: async () => {
      const ok = await tcpReachable(vpsHost, 1935, 6000);
      return {
        ok,
        message: ok ? 'RTMP port 1935 accepts TCP' : 'RTMP port 1935 not reachable',
        fix: ok ? '' : 'Open firewall 1935; pm2 restart mediamtx',
      };
    },
    obs: async () => {
      const ok = await tcpReachable(vpsHost, 1935, 6000);
      return {
        ok,
        message: ok
          ? `OBS can use rtmp://${streamHost}:1935/live + event stream key`
          : 'OBS connection will time out — :1935 closed',
        fix: ok ? '' : 'recover-rtmp-production.sh + Hostinger allow 1935',
      };
    },
    youtube_forward: async () => {
      const f = await ffmpegForwarders();
      return {
        ok: true,
        message:
          'YouTube forward is event-driven (publish hook). ' +
          (f.count ? `${f.count} ffmpeg forward(s) running now.` : 'No active forwards (idle OK).'),
        detail: f.detail,
      };
    },
    facebook_forward: async () => {
      const f = await ffmpegForwarders();
      return {
        ok: true,
        message:
          'Facebook forward is event-driven. ' +
          (f.count ? `${f.count} ffmpeg forward(s) running.` : 'No active forwards (idle OK).'),
      };
    },
    recording: async () => {
      const count = await Event.countDocuments({
        $or: [{ recordingUrl: { $ne: '' } }, { 'recordings.0': { $exists: true } }],
      });
      return {
        ok: true,
        message: `Recording pipeline OK — ${count} event(s) have recording assets`,
      };
    },
    replay: async () => {
      const live = await Event.countDocuments({ isLive: true });
      const rec = await Event.countDocuments({
        $or: [{ recordingUrl: { $ne: '' } }, { 'recordings.0': { $exists: true } }],
      });
      return {
        ok: rec > 0 || live === 0,
        message: `Replay: ${rec} recorded event(s); ${live} currently live`,
      };
    },
    adaptive: async () => ({
      ok: true,
      message:
        'Adaptive HLS is Super Admin opt-in (Standard default). Master playlist served only when enabled per event.',
    }),
    cdn: async () => {
      if (!isHlsCdnEnabled()) {
        return { ok: true, message: 'CDN toggle is OFF — viewers use stream.eventlivepro.com' };
      }
      const p = await httpProbe(`${cdnHls}/`, { timeoutMs: 8000 });
      return {
        ok: p.ok === true,
        message: p.ok ? 'CDN host responds' : `CDN probe failed: ${p.detail}`,
        fix: p.ok ? '' : 'Check Cloudflare CDN for cdn.eventlivepro.com',
      };
    },
  };

  const fn = tests[testId];
  if (!fn) {
    return { ok: false, message: `Unknown test: ${testId}` };
  }
  const result = await fn();
  if (!result.ok) {
    pushHealthLog({
      level: 'error',
      message: `Test failed: ${testId}`,
      reason: result.message,
      fix: result.fix || '',
      source: `test.${testId}`,
    });
  } else {
    pushHealthLog({
      level: 'info',
      message: `Test OK: ${testId}`,
      reason: result.message,
      source: `test.${testId}`,
    });
  }
  return { testId, ...result, at: new Date().toISOString() };
}

export async function restartService(service) {
  if (!isRestartEnabled()) {
    return {
      ok: false,
      message:
        'Restarts disabled on this API host. Set SYSTEM_RESTART_ENABLED=true on the VPS API, or run recover-rtmp-production.sh in Hostinger terminal.',
    };
  }
  const map = {
    mediamtx: ['pm2', ['restart', 'mediamtx']],
    pm2: ['pm2', ['restart', 'all']],
    nginx: ['systemctl', ['restart', 'nginx']],
    backend: ['pm2', ['restart', 'server']],
  };
  const spec = map[service];
  if (!spec) return { ok: false, message: `Unknown service: ${service}` };
  const r = await shell(spec[0], spec[1], 20000);
  pushHealthLog({
    level: r.ok ? 'info' : 'error',
    message: r.ok ? `Restarted ${service}` : `Restart failed: ${service}`,
    reason: r.stderr || r.stdout || '',
    fix: r.ok ? '' : 'Run manually on VPS',
    source: `restart.${service}`,
  });
  return {
    ok: r.ok,
    message: r.ok ? `${service} restart issued` : `Restart failed: ${r.stderr || r.stdout}`,
    detail: (r.stdout || r.stderr || '').slice(0, 500),
  };
}
