import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatCurrency } from '../../utils/format.js';

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminService.analytics().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!stats) return <p className="text-slate-500">Loading…</p>;

  const cards = [
    { label: 'Total Customers', value: stats.customers ?? 0 },
    { label: 'Total Sub Admins', value: stats.subAdmins ?? 0 },
    { label: 'Total Live Links', value: stats.liveLinks ?? stats.events ?? 0 },
    { label: 'Revenue', value: formatCurrency(stats.revenue ?? 0) },
    { label: 'Credits Sold', value: stats.creditsSold ?? 0 },
    {
      label: 'Active Streams',
      value: stats.activeStreams ?? stats.liveEvents ?? 0,
      highlight: (stats.activeStreams ?? stats.liveEvents ?? 0) > 0,
    },
    {
      label: 'Pending Payments',
      value: stats.pendingPayments ?? 0,
      highlight: (stats.pendingPayments ?? 0) > 0,
    },
    {
      label: 'Pending approvals',
      value: stats.pendingCustomers ?? 0,
      highlight: (stats.pendingCustomers ?? 0) > 0,
    },
  ];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`card ${c.highlight ? 'ring-2 ring-amber-300' : ''}`}>
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
