import { useState } from 'react';
import AdminOverview from '../components/admin/AdminOverview.jsx';
import AdminCustomers from '../components/admin/AdminCustomers.jsx';
import AdminSubAdmins from '../components/admin/AdminSubAdmins.jsx';
import AdminCreditOrders from '../components/admin/AdminCreditOrders.jsx';
import AdminPayments from '../components/admin/AdminPayments.jsx';
import AdminEvents from '../components/admin/AdminEvents.jsx';
import AdminPackages from '../components/admin/AdminPackages.jsx';
import AdminSettings from '../components/admin/AdminSettings.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'subadmins', label: 'Sub Admins' },
  { id: 'credits', label: 'Credit Orders' },
  { id: 'payments', label: 'Payments' },
  { id: 'customers', label: 'Customers' },
  { id: 'events', label: 'Events' },
  { id: 'packages', label: 'Packages' },
  { id: 'settings', label: 'Settings' },
];

export default function Admin() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-slate-900">Admin Console</h1>
      <p className="mt-1 text-slate-600">Manage customers, payments, packages and settings.</p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? 'border-b-2 border-brand-600 text-brand-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <AdminOverview
            onGoToPayments={() => setTab('payments')}
            onGoToCredits={() => setTab('credits')}
          />
        )}
        {tab === 'subadmins' && <AdminSubAdmins />}
        {tab === 'credits' && <AdminCreditOrders />}
        {tab === 'payments' && <AdminPayments />}
        {tab === 'customers' && <AdminCustomers />}
        {tab === 'events' && <AdminEvents />}
        {tab === 'packages' && <AdminPackages />}
        {tab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}
