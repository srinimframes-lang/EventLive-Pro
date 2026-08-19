import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AdminOverview from '../components/admin/AdminOverview.jsx';
import YoutubeConnectCard from '../components/YoutubeConnectCard.jsx';
import AdminCustomers from '../components/admin/AdminCustomers.jsx';
import AdminPayments from '../components/admin/AdminPayments.jsx';
import AdminEvents from '../components/admin/AdminEvents.jsx';
import AdminSettings from '../components/admin/AdminSettings.jsx';
import AdminDomains from '../components/admin/AdminDomains.jsx';
import AdminThemes from '../components/admin/AdminThemes.jsx';
import AdminBanners from '../components/admin/AdminBanners.jsx';
import AdminAdmins from '../components/admin/AdminAdmins.jsx';
import AdminSystemHealth from '../components/admin/AdminSystemHealth.jsx';
import AdminBackupManager from '../components/admin/AdminBackupManager.jsx';

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
  { id: 'health', label: 'System Health' },
  { id: 'backups', label: 'Backup Manager' },
  { id: 'settings', label: 'Settings' },
];

function AdminWeddingCardAction() {
  return (
    <section
      id="admin-dashboard-wedding-card"
      className="card border-2 border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-sm"
    >
      <h2 className="font-display text-2xl font-bold text-slate-900">📤 Upload Wedding Card</h2>
      <p className="mt-2 text-sm text-slate-600 sm:text-base">
        Upload a wedding invitation and automatically create the wedding live page.
      </p>
      <Link
        to="/wedding-card"
        className="btn-primary mt-5 inline-flex w-full justify-center px-5 py-3 text-base sm:w-auto"
      >
        Upload Wedding Card
      </Link>
    </section>
  );
}

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

      <div className="mt-6 -mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-2 border-b border-slate-200 pb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === t.id
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <AdminWeddingCardAction />
            <YoutubeConnectCard returnTo="/admin" title="YouTube Integration" />
            <AdminOverview />
          </div>
        )}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'payments' && <AdminPayments />}
        {activeTab === 'events' && <AdminEvents />}
        {activeTab === 'whitelabel' && <AdminDomains />}
        {isSuperAdmin && activeTab === 'admins' && <AdminAdmins />}
        {isSuperAdmin && activeTab === 'themes' && <AdminThemes />}
        {isSuperAdmin && activeTab === 'banners' && <AdminBanners />}
        {isSuperAdmin && activeTab === 'health' && <AdminSystemHealth />}
        {isSuperAdmin && activeTab === 'backups' && <AdminBackupManager />}
        {isSuperAdmin && activeTab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}
