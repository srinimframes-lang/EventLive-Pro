import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import AdminOverview from '../components/admin/AdminOverview.jsx';
import AdminCustomers from '../components/admin/AdminCustomers.jsx';
import AdminPayments from '../components/admin/AdminPayments.jsx';
import AdminEvents from '../components/admin/AdminEvents.jsx';
import AdminSettings from '../components/admin/AdminSettings.jsx';
import AdminDomains from '../components/admin/AdminDomains.jsx';
import AdminThemes from '../components/admin/AdminThemes.jsx';
import AdminBanners from '../components/admin/AdminBanners.jsx';
import AdminAdmins from '../components/admin/AdminAdmins.jsx';

const BASE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Customers' },
  { id: 'payments', label: 'Payments' },
  { id: 'events', label: 'Events' },
  { id: 'whitelabel', label: 'White Label' },
];

const SUPER_TABS = [
  { id: 'admins', label: 'Admins' },
  { id: 'themes', label: 'Themes' },
  { id: 'banners', label: 'Banners' },
  { id: 'settings', label: 'Settings' },
];

export default function Admin() {
  const { isSuperAdmin } = useAuth();
  const tabs = isSuperAdmin ? [...BASE_TABS, ...SUPER_TABS] : BASE_TABS;
  const [tab, setTab] = useState('dashboard');

  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'dashboard';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-slate-900">
        {isSuperAdmin ? 'Super Admin Console' : 'Admin Console'}
      </h1>
      <p className="mt-1 text-slate-600">
        {isSuperAdmin
          ? 'Full platform access across all tenants.'
          : 'Manage your customers, events, payments and live links.'}
      </p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === t.id
                ? 'border-b-2 border-brand-600 text-brand-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'dashboard' && <AdminOverview />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'payments' && <AdminPayments />}
        {activeTab === 'events' && <AdminEvents />}
        {activeTab === 'whitelabel' && <AdminDomains />}
        {isSuperAdmin && activeTab === 'admins' && <AdminAdmins />}
        {isSuperAdmin && activeTab === 'themes' && <AdminThemes />}
        {isSuperAdmin && activeTab === 'banners' && <AdminBanners />}
        {isSuperAdmin && activeTab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}
