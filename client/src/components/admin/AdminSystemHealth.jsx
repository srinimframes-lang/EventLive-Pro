import { useCallback, useEffect, useRef, useState } from 'react';
import { adminService } from '../../services/admin.service.js';

const REFRESH_MS = 30_000;

const SECTION_TITLES = {
  server: 'Server Health',
  services: 'Streaming Services',
  streaming: 'Streaming Health',
  forwarding: 'Forwarding Health',
  network: 'Network',
  database: 'Database',
};

const TESTS = [
  { id: 'rtmp', label: 'Test RTMP' },
  { id: 'obs', label: 'Test OBS Connection' },
  { id: 'youtube_forward', label: 'Test YouTube Forward' },
  { id: 'facebook_forward', label: 'Test Facebook Forward' },
  { id: 'recording', label: 'Test Recording' },
  { id: 'replay', label: 'Test Replay' },
  { id: 'adaptive', label: 'Test Adaptive HLS' },
  { id: 'cdn', label: 'Test CDN' },
];

const RESTARTS = [
  { id: 'mediamtx', label: 'Restart MediaMTX' },
  { id: 'pm2', label: 'Restart PM2' },
  { id: 'nginx', label: 'Restart Nginx' },
];

function statusDot(status) {
  if (status === 'healthy') return '🟢';
  if (status === 'warning') return '🟡';
  return '🔴';
}

function scoreTone(score) {
  if (score >= 90) return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (score >= 70) return 'bg-amber-50 text-amber-900 ring-amber-200';
  if (score >= 50) return 'bg-orange-50 text-orange-900 ring-orange-200';
  return 'bg-red-50 text-red-900 ring-red-300';
}

function CheckRow({ item }) {
  return (
    <li className="flex gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="shrink-0 text-base leading-6" aria-hidden>
        {statusDot(item.status)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
        {item.detail ? <p className="mt-0.5 break-words text-xs text-slate-500">{item.detail}</p> : null}
        {item.status === 'error' && item.reason ? (
          <p className="mt-1 text-xs text-red-700">Reason: {item.reason}</p>
        ) : null}
        {item.status === 'error' && item.fix ? (
          <p className="mt-0.5 text-xs text-slate-600">Fix: {item.fix}</p>
        ) : null}
      </div>
    </li>
  );
}

export default function AdminSystemHealth() {
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyTest, setBusyTest] = useState('');
  const [busyRestart, setBusyRestart] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [alert, setAlert] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const ackKeysRef = useRef(new Set());
  const timerRef = useRef(null);
  const tickRef = useRef(null);

  const loadLogs = useCallback(async () => {
    try {
      const level = logFilter === 'all' ? undefined : logFilter;
      const rows = await adminService.getSystemHealthLogs(level ? { level } : {});
      setLogs(Array.isArray(rows) ? rows : []);
    } catch {
      /* keep previous */
    }
  }, [logFilter]);

  const load = useCallback(async () => {
    try {
      const snap = await adminService.getSystemHealth();
      setData(snap);
      setError('');
      const crit = snap.critical || [];
      const fresh = crit.filter((c) => !ackKeysRef.current.has(c.key));
      if (fresh.length) {
        setAlert(fresh[0]);
      } else if (!crit.length) {
        setAlert(null);
      }
      await loadLogs();
    } catch (e) {
      setError(e.message || 'Failed to load system health');
    } finally {
      setLoading(false);
      setCountdown(REFRESH_MS / 1000);
    }
  }, [loadLogs]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    tickRef.current = setInterval(() => {
      setCountdown((n) => (n <= 1 ? REFRESH_MS / 1000 : n - 1));
    }, 1000);
    return () => {
      clearInterval(timerRef.current);
      clearInterval(tickRef.current);
    };
  }, [load]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const runTest = async (id) => {
    setBusyTest(id);
    setTestMsg('');
    try {
      const r = await adminService.runSystemHealthTest(id);
      setTestMsg(`${r.ok ? '✓' : '✗'} ${r.message}${r.fix ? ` — ${r.fix}` : ''}`);
      await load();
    } catch (e) {
      setTestMsg(e.message);
    } finally {
      setBusyTest('');
    }
  };

  const doRestart = async (id) => {
    if (!window.confirm(`Restart ${id}? This only runs when SYSTEM_RESTART_ENABLED is set on the VPS API.`)) {
      return;
    }
    setBusyRestart(id);
    try {
      const r = await adminService.restartSystemService(id);
      setTestMsg(r.message || (r.ok ? 'Restart issued' : 'Restart failed'));
      await load();
    } catch (e) {
      setTestMsg(e.message);
    } finally {
      setBusyRestart('');
    }
  };

  const dismissAlert = async () => {
    if (alert?.key) ackKeysRef.current.add(alert.key);
    try {
      await adminService.ackSystemHealth({
        message: `Acknowledged: ${alert?.label || 'critical'}`,
        reason: alert?.reason || '',
        fix: alert?.fix || '',
      });
    } catch {
      /* ignore */
    }
    const remaining = (data?.critical || []).filter((c) => !ackKeysRef.current.has(c.key));
    setAlert(remaining[0] || null);
  };

  const downloadLogs = () => {
    const lines = (logs || []).map((l) => {
      const t = new Date(l.at).toISOString();
      return `[${t}] ${l.level.toUpperCase()} ${l.message}${l.reason ? ` | ${l.reason}` : ''}${
        l.fix ? ` | fix: ${l.fix}` : ''
      }`;
    });
    const blob = new Blob([lines.join('\n') || 'No logs'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eventlivepro-health-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return <p className="text-slate-500">Loading system health…</p>;
  }

  if (error && !data) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }

  const score = data?.score ?? 0;
  const checks = data?.checks || {};

  return (
    <div className="space-y-6">
      {alert ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl ring-1 ring-red-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Critical service</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{alert.label}</h3>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold">Reason:</span> {alert.reason || 'Unknown'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold">Suggested fix:</span> {alert.fix || 'Check VPS logs'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {RESTARTS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={Boolean(busyRestart) || !data?.restartEnabled}
                  onClick={() => doRestart(r.id)}
                >
                  {busyRestart === r.id ? '…' : r.label}
                </button>
              ))}
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={dismissAlert}
              >
                Acknowledge
              </button>
            </div>
            {!data?.restartEnabled ? (
              <p className="mt-3 text-xs text-amber-700">
                One-click restart is disabled on this API host. Use Hostinger terminal or set
                SYSTEM_RESTART_ENABLED=true on the VPS API.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">System Health</h2>
          <p className="mt-1 text-sm text-slate-500">
            Auto-refresh every 30s · next in {countdown}s
            {data?.checkedAt ? ` · last ${new Date(data.checkedAt).toLocaleTimeString()}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh now
        </button>
      </div>

      {error ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}

      <div className={`card ring-2 ${scoreTone(score)}`}>
        <p className="text-sm font-medium">Overall Health Score</p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums">{score}%</p>
        <p className="mt-1 text-sm">{data?.scoreLabel}</p>
        <p className="mt-2 text-xs text-slate-600">
          🟢 {data?.healthyCount ?? 0} · 🟡 {data?.warningCount ?? 0} · 🔴 {data?.criticalCount ?? 0}
        </p>
        {data?.hosts ? (
          <p className="mt-2 break-all text-xs text-slate-500">
            Stream {data.hosts.streamDomain} · VPS {data.hosts.vpsHost} · API host {data.hosts.apiHostname}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(SECTION_TITLES).map(([key, title]) => {
          const group = checks[key] || {};
          return (
            <section key={key} className="card">
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <ul className="mt-2">
                {Object.entries(group).map(([k, item]) => (
                  <CheckRow key={k} item={item} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="card space-y-3">
        <h3 className="text-base font-bold text-slate-900">Auto Test Buttons</h3>
        <div className="flex flex-wrap gap-2">
          {TESTS.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={Boolean(busyTest)}
              onClick={() => runTest(t.id)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busyTest === t.id ? 'Testing…' : t.label}
            </button>
          ))}
        </div>
        {testMsg ? <p className="text-sm text-slate-700">{testMsg}</p> : null}
      </section>

      <section className="card space-y-3">
        <h3 className="text-base font-bold text-slate-900">One-click Restart</h3>
        <p className="text-xs text-slate-500">
          Safe recovery only — does not change stream keys, HLS paths, or recording config.
          {!data?.restartEnabled ? ' Currently disabled on this API host.' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {RESTARTS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={Boolean(busyRestart) || !data?.restartEnabled}
              onClick={() => doRestart(r.id)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {busyRestart === r.id ? '…' : r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">Logs</h3>
          <div className="flex flex-wrap gap-2">
            {['all', 'error', 'warning', 'info'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setLogFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  logFilter === f
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 text-slate-600'
                }`}
              >
                {f === 'all' ? 'Last 100' : f}
              </button>
            ))}
            <button
              type="button"
              onClick={downloadLogs}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              Download logs
            </button>
          </div>
        </div>
        <ul className="max-h-80 overflow-auto rounded-lg border border-slate-100 bg-slate-50 text-xs">
          {(logs || []).length === 0 ? (
            <li className="px-3 py-4 text-slate-500">No logs yet.</li>
          ) : (
            logs.map((l, i) => (
              <li key={`${l.at}-${i}`} className="border-b border-slate-100 px-3 py-2 last:border-0">
                <span className="font-mono text-slate-400">{new Date(l.at).toLocaleString()}</span>{' '}
                <span
                  className={
                    l.level === 'error'
                      ? 'font-semibold text-red-700'
                      : l.level === 'warning'
                        ? 'font-semibold text-amber-700'
                        : 'text-slate-600'
                  }
                >
                  [{l.level}]
                </span>{' '}
                {l.message}
                {l.reason ? <span className="text-slate-500"> — {l.reason}</span> : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
