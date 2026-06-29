import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatCurrency } from '../../utils/format.js';

export default function AdminOverview({ onGoToPayments }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminService.analytics().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!stats) return <p className="text-slate-500">Loading…</p>;

  const cards = [
    { label: 'Total Customers', value: stats.customers },
    { label: 'Total Events', value: stats.events },
    { label: 'Pending Payments', value: stats.pendingBookings, highlight: stats.pendingBookings > 0 },
    { label: 'Completed Events', value: stats.completedEvents ?? 0 },
    { label: 'Live now', value: stats.liveEvents },
    { label: 'Pending approvals', value: stats.pendingCustomers ?? 0, highlight: (stats.pendingCustomers ?? 0) > 0 },
    { label: 'Active packages', value: stats.packages },
    { label: 'Revenue', value: formatCurrency(stats.revenue) },
  ];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`card ${c.highlight ? 'ring-2 ring-amber-300' : ''}`}
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      {stats.pendingBookings > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            You have {stats.pendingBookings} payment(s) awaiting verification.
          </p>
          <button type="button" className="btn-primary" onClick={onGoToPayments}>
            Review payments
          </button>
        </div>
      )}
    </div>
  );
}
