import { useCallback, useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatCurrency, formatDateTime } from '../../utils/format.js';

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
];

export default function AdminPayments() {
  const [filter, setFilter] = useState('pending');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    adminService
      .listPayments(filter)
      .then(setPayments)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (p) => {
    if (!window.confirm(`Approve and add ${p.credits} credit(s) to ${p.user?.email}?`)) return;
    setBusyId(p.id);
    setError('');
    try {
      await adminService.approvePayment(p.id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (p) => {
    const note = window.prompt(
      'Reason for rejection (shown to customer):',
      'Payment could not be verified.'
    );
    if (note === null) return;
    setBusyId(p.id);
    setError('');
    try {
      await adminService.rejectPayment(p.id, note);
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
      ) : payments.length === 0 ? (
        <p className="text-slate-600">No payment requests in this view.</p>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => (
            <div key={p.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {p.credits} credit{p.credits > 1 ? 's' : ''} · {formatCurrency(p.amount)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {p.user?.name} · {p.user?.email}
                    {p.user?.phone ? ` · ${p.user.phone}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Submitted {formatDateTime(p.createdAt)}
                    {p.reference ? ` · Ref: ${p.reference}` : ''} · Balance now:{' '}
                    {p.user?.creditBalance ?? 0}
                  </p>
                </div>
                {p.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === p.id}
                      onClick={() => approve(p)}
                    >
                      {busyId === p.id ? 'Working…' : 'Approve & add credits'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={busyId === p.id}
                      onClick={() => reject(p)}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`badge ${
                        p.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.reviewNote && <span className="text-xs text-slate-500">— {p.reviewNote}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
