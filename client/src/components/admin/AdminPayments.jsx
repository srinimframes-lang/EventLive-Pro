import { useCallback, useEffect, useState } from 'react';
import { bookingService } from '../../services/booking.service.js';
import { formatCurrency, formatDateTime, resolveMediaUrl } from '../../utils/format.js';

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
];

export default function AdminPayments() {
  const [filter, setFilter] = useState('pending');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    bookingService
      .listAll(filter)
      .then(setBookings)
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
      await bookingService.approve(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    const note = window.prompt('Reason for rejection (shown to customer):', 'Payment could not be verified.');
    if (note === null) return;
    setBusyId(id);
    setError('');
    try {
      await bookingService.reject(id, note);
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
      ) : bookings.length === 0 ? (
        <p className="text-slate-600">No bookings in this view.</p>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const couple =
              b.brideName && b.groomName ? `${b.brideName} & ${b.groomName}` : b.eventTitle || '—';
            const shot = resolveMediaUrl(b.paymentScreenshot);
            return (
              <div key={b.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{couple}</p>
                    <p className="text-sm text-slate-500">
                      {b.customer?.name} · {b.customer?.email}
                      {b.customer?.phone ? ` · ${b.customer.phone}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {b.packageName} · {formatCurrency(b.amount)}
                      {b.eventDate && <> · {formatDateTime(b.eventDate)}</>}
                    </p>
                    {b.venue && <p className="text-sm text-slate-500">Venue: {b.venue}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Paid via {b.paymentMethod || 'n/a'}
                      {b.paymentReference ? ` · Ref: ${b.paymentReference}` : ''} · Submitted{' '}
                      {formatDateTime(b.createdAt)}
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

                {b.status === 'pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === b.id}
                      onClick={() => approve(b.id)}
                    >
                      {busyId === b.id ? 'Working…' : 'Approve & create event'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={busyId === b.id}
                      onClick={() => reject(b.id)}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`badge ${
                        b.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {b.status}
                    </span>
                    {b.event && (
                      <a
                        href={`/events/${b.event.slug || b.event.id}/live`}
                        className="text-sm text-brand-600 hover:underline"
                      >
                        View event
                      </a>
                    )}
                    {b.adminNote && <span className="text-sm text-slate-500">— {b.adminNote}</span>}
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
