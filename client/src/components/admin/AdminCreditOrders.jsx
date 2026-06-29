import { useCallback, useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatCurrency, formatDateTime, resolveMediaUrl } from '../../utils/format.js';

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
];

export default function AdminCreditOrders() {
  const [filter, setFilter] = useState('pending');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    adminService
      .listCreditOrders(filter)
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await adminService.approveCreditOrder(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    const note = window.prompt('Reason for rejection:', 'Payment could not be verified.');
    if (note === null) return;
    setBusyId(id);
    setError('');
    try {
      await adminService.rejectCreditOrder(id, note);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              filter === f.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-slate-600">No credit orders in this view.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const shot = resolveMediaUrl(o.paymentScreenshot);
            return (
              <div key={o.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {o.quantity} × {o.type === 'server' ? 'Private server' : 'YouTube'} credit ·{' '}
                      {formatCurrency(o.amount)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {o.subAdmin?.name} · {o.subAdmin?.email}
                      {o.subAdmin?.phone ? ` · ${o.subAdmin.phone}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Paid via {o.paymentMethod || 'n/a'}
                      {o.paymentReference ? ` · Ref: ${o.paymentReference}` : ''} · Submitted{' '}
                      {formatDateTime(o.createdAt)}
                    </p>
                  </div>
                  {shot && (
                    <a href={shot} target="_blank" rel="noreferrer" className="shrink-0">
                      <img
                        src={shot}
                        alt="Payment proof"
                        className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                      />
                    </a>
                  )}
                </div>

                {o.status === 'pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === o.id}
                      onClick={() => approve(o.id)}
                    >
                      {busyId === o.id ? 'Working…' : 'Approve & add credits'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={busyId === o.id}
                      onClick={() => reject(o.id)}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`badge ${
                        o.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {o.status}
                    </span>
                    {o.adminNote && <span className="text-sm text-slate-500">— {o.adminNote}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
