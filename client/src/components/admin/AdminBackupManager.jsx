import { useCallback, useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '—';
  }
}

function statusClass(s) {
  if (s === 'success' || s === 'ok' || s === 'connected') return 'text-emerald-700';
  if (s === 'partial' || s === 'running' || s === 'pending') return 'text-amber-700';
  if (s === 'failed' || s === 'disconnected') return 'text-red-700';
  return 'text-slate-600';
}

export default function AdminBackupManager() {
  const [status, setStatus] = useState(null);
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [s, rows] = await Promise.all([
        adminService.getBackupStatus(),
        adminService.listBackups({ limit: 40 }),
      ]);
      setStatus(s);
      setList(Array.isArray(rows) ? rows : []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const runManual = async () => {
    if (!window.confirm('Start a manual backup now? Live streaming will not be stopped.')) return;
    setBusy('run');
    setMsg('');
    try {
      const data = await adminService.runBackup();
      setMsg(`Backup ${data?.status || 'finished'}: ${data?.backupId || ''}`);
      await refresh();
    } catch (e) {
      setMsg(e.message || 'Backup failed');
    } finally {
      setBusy('');
    }
  };

  const download = async (id) => {
    setBusy(`dl-${id}`);
    try {
      await adminService.downloadBackup(id);
    } catch (e) {
      setMsg(e.message || 'Download failed');
    } finally {
      setBusy('');
    }
  };

  const restore = async (id) => {
    if (
      !window.confirm(
        'Restore this backup into MongoDB (and recordings)? This can overwrite data. Live MediaMTX will not be stopped, but avoid restoring during peak live events.'
      )
    ) {
      return;
    }
    if (!window.confirm('Type-confirm: restore will replace collections. Continue?')) return;
    setBusy(`rs-${id}`);
    setMsg('');
    try {
      const data = await adminService.restoreBackup(id, { confirm: true, restoreRecordings: true });
      setMsg(
        `Restore OK — mongo=${data?.mongoRestored ? 'yes' : 'no'}, recordings=${data?.recordingsRestored ?? 0}`
      );
      await refresh();
    } catch (e) {
      setMsg(e.message || 'Restore failed');
    } finally {
      setBusy('');
    }
  };

  if (loading && !status) {
    return <p className="text-slate-500">Loading Backup Manager…</p>;
  }

  if (error && !status) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }

  const last = status?.lastBackupTime;
  const next = status?.nextScheduledBackup;
  const latestSize = status?.lastSuccess?.sizeBytes ?? status?.latest?.sizeBytes ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Backup Manager</h2>
          <p className="mt-1 text-sm text-slate-500">
            Daily MongoDB + recordings ZIP · keeps last {status?.keepCount ?? 30} · never stops live
            streaming
          </p>
        </div>
        <button
          type="button"
          disabled={Boolean(busy) || status?.running}
          onClick={runManual}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === 'run' || status?.running ? 'Backing up…' : 'Manual Backup'}
        </button>
      </div>

      {msg ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{msg}</p> : null}
      {error ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Last backup</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatWhen(last)}</p>
          <p className={`mt-1 text-xs ${statusClass(status?.lastSuccess?.status || status?.latest?.status)}`}>
            {status?.lastSuccess?.status || status?.latest?.status || 'none'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Next scheduled</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatWhen(next)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Daily {String(status?.scheduleHourUtc ?? 3).padStart(2, '0')}:00 UTC
            {status?.enabled === false ? ' · scheduler disabled' : ''}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Latest backup size</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatBytes(latestSize)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Local total {formatBytes(status?.totalLocalSizeBytes)} · {status?.backupCount ?? 0}{' '}
            record(s)
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">MongoDB status</p>
          <p className={`mt-1 text-lg font-bold ${statusClass(status?.mongoConnection)}`}>
            {status?.mongoConnection || '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Last dump: {status?.lastSuccess?.mongoStatus || status?.latest?.mongoStatus || '—'}
            {status?.lastSuccess?.mongoMethod ? ` (${status.lastSuccess.mongoMethod})` : ''}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Recording backup status</p>
          <p
            className={`mt-1 text-lg font-bold ${statusClass(
              status?.lastSuccess?.recordingsStatus || status?.latest?.recordingsStatus
            )}`}
          >
            {status?.lastSuccess?.recordingsStatus || status?.latest?.recordingsStatus || '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Files last run: {status?.lastSuccess?.recordingsFileCount ?? status?.latest?.recordingsFileCount ?? 0}
            {status?.recordingsRootExists ? '' : ' · recordings root missing on this host'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Cloud upload (R2)</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {status?.uploadR2 ? 'Enabled' : 'Local only'}
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">{status?.backupsRoot}</p>
        </div>
      </div>

      <section className="card space-y-3">
        <h3 className="text-base font-bold text-slate-900">Backup history</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">Mongo</th>
                <th className="px-2 py-2">Recordings</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-slate-500">
                    No backups yet. Run Manual Backup or wait for the daily schedule.
                  </td>
                </tr>
              ) : (
                list.map((b) => (
                  <tr key={b._id || b.backupId} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono text-xs">{b.backupId}</td>
                    <td className="px-2 py-2 text-xs">{formatWhen(b.finishedAt || b.createdAt)}</td>
                    <td className={`px-2 py-2 text-xs font-semibold ${statusClass(b.status)}`}>
                      {b.status}
                      {b.r2Uploaded ? ' · R2' : ''}
                    </td>
                    <td className="px-2 py-2 text-xs">{formatBytes(b.sizeBytes)}</td>
                    <td className="px-2 py-2 text-xs">{b.mongoStatus}</td>
                    <td className="px-2 py-2 text-xs">
                      {b.recordingsStatus} ({b.recordingsFileCount || 0})
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                          disabled={Boolean(busy)}
                          onClick={() => download(b.backupId || b._id)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 disabled:opacity-50"
                          disabled={Boolean(busy) || b.status === 'failed'}
                          onClick={() => restore(b.backupId || b._id)}
                        >
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(status?.logs || []).length > 0 ? (
        <section className="card space-y-2">
          <h3 className="text-base font-bold text-slate-900">Recent backup logs</h3>
          <ul className="max-h-48 overflow-auto rounded-lg border border-slate-100 bg-slate-50 text-xs">
            {status.logs.map((l, i) => (
              <li key={`${l.at}-${i}`} className="border-b border-slate-100 px-3 py-1.5 last:border-0">
                <span className="text-slate-400">{formatWhen(l.at)}</span>{' '}
                <span className={statusClass(l.level === 'error' ? 'failed' : l.level)}>[{l.level}]</span>{' '}
                {l.message}
                {l.detail ? <span className="text-slate-500"> — {l.detail}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
