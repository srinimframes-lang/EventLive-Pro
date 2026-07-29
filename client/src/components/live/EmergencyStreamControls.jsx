import { useState } from 'react';
import { streamService } from '../../services/stream.service.js';

const ACTIONS = [
  { id: 'force_server', label: 'Force Server' },
  { id: 'force_youtube', label: 'Force YouTube' },
  { id: 'override', label: 'Emergency Override' },
  { id: 'disable', label: 'Emergency Disable' },
  { id: 'enable', label: 'Emergency Enable' },
];

/**
 * Super Admin emergency failover controls. Hidden unless feature flag is on.
 */
export default function EmergencyStreamControls({
  eventId,
  enabled,
  status,
  onUpdated,
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  if (!enabled || !eventId) return null;

  const run = async (action) => {
    setBusy(action);
    setError('');
    try {
      const data = await streamService.emergency(eventId, action);
      onUpdated?.(data);
    } catch (err) {
      setError(err.message || 'Emergency action failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-4">
      <h3 className="text-sm font-semibold text-rose-950">Emergency stream controls</h3>
      <p className="mt-1 text-xs text-rose-900/70">
        Super Admin only. Active source:{' '}
        <span className="font-medium">{status?.activeSource || 'server'}</span>
        {status?.backupStatus ? (
          <>
            {' '}
            · Backup: <span className="font-medium">{status.backupStatus}</span>
          </>
        ) : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run(a.id)}
            className="rounded-md border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
          >
            {busy === a.id ? '…' : a.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
