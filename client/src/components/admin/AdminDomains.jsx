import { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/admin.service.js';

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
};

const BRANDING_FIELDS = [
  ['businessName', 'Business name'],
  ['tagline', 'Tagline'],
  ['primaryColor', 'Primary color (hex)'],
  ['whatsappNumber', 'WhatsApp number'],
  ['contactPhone', 'Contact phone'],
  ['contactEmail', 'Contact email'],
  ['address', 'Address'],
  ['footer', 'Footer text'],
  ['logoUrl', 'Logo URL'],
];

export default function AdminDomains() {
  const [domains, setDomains] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ customerId: '', host: '' });

  const [brandingId, setBrandingId] = useState('');
  const [branding, setBranding] = useState({});
  const [savingBrand, setSavingBrand] = useState(false);

  const flash = (m) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 2500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([adminService.listDomains(), adminService.listCustomers()]);
      setDomains(d || []);
      setCustomers(c || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const customerName = useMemo(() => {
    const map = {};
    for (const c of customers) map[c.id] = c.name || c.email;
    return map;
  }, [customers]);

  const replaceDomain = (updated) =>
    setDomains((list) => list.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));

  const act = async (fn, ...args) => {
    setError('');
    try {
      return await fn(...args);
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const createDomain = async (e) => {
    e.preventDefault();
    if (!form.customerId || !form.host.trim()) return;
    const created = await act(adminService.createDomain, { customerId: form.customerId, host: form.host.trim() });
    if (created) {
      setForm({ customerId: '', host: '' });
      await load();
      flash('Domain added');
    }
  };

  const verify = async (id) => {
    const u = await act(adminService.verifyDomain, id);
    if (u) {
      replaceDomain(u);
      flash(u.dnsVerified ? 'DNS verified' : 'TXT record not found yet');
    }
  };

  const approve = async (d) => {
    let u = await act(adminService.approveDomain, d.id, false);
    if (!u && !d.dnsVerified) {
      if (window.confirm('DNS is not verified. Approve anyway (force)?')) {
        u = await act(adminService.approveDomain, d.id, true);
      }
    }
    if (u) {
      replaceDomain(u);
      flash('Domain approved & active');
    }
  };

  const suspend = async (id) => {
    const u = await act(adminService.suspendDomain, id);
    if (u) {
      replaceDomain(u);
      flash('Domain suspended');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this domain permanently?')) return;
    const r = await act(adminService.removeDomain, id);
    if (r) {
      setDomains((list) => list.filter((d) => d.id !== id));
      flash('Domain removed');
    }
  };

  const pickBrandingCustomer = (id) => {
    setBrandingId(id);
    const c = customers.find((x) => x.id === id);
    setBranding({ ...(c?.branding || {}) });
  };

  const saveBranding = async (e) => {
    e.preventDefault();
    if (!brandingId) return;
    setSavingBrand(true);
    setError('');
    try {
      await adminService.updateCustomerBranding(brandingId, branding);
      await load();
      flash('Branding saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBrand(false);
    }
  };

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-8">
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Add domain */}
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900">Custom domains</h2>
        <form onSubmit={createDomain} className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Customer</label>
            <select
              className="input"
              value={form.customerId}
              onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Domain</label>
            <input
              className="input"
              placeholder="live.customer.com"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            />
          </div>
          <button type="submit" className="btn-outline">Add domain</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Domain</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Status</th>
                <th className="py-2">DNS</th>
                <th className="py-2">SSL</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-slate-500">No domains yet.</td></tr>
              )}
              {domains.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 font-medium text-slate-900">{d.host}</td>
                  <td className="py-2 text-slate-600">
                    {d.customer?.name || customerName[d.customer?.id || d.customer] || '—'}
                  </td>
                  <td className="py-2">
                    <span className={`badge ${STATUS_STYLES[d.status] || 'bg-slate-100 text-slate-600'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2 text-slate-600">{d.dnsVerified ? '✓' : '—'}</td>
                  <td className="py-2 text-slate-600">{d.sslStatus}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => verify(d.id)}>
                        Verify
                      </button>
                      {d.status !== 'active' && (
                        <button type="button" className="btn-ghost px-2 py-1 text-xs text-emerald-700" onClick={() => approve(d)}>
                          Approve
                        </button>
                      )}
                      {d.status === 'active' && (
                        <button type="button" className="btn-ghost px-2 py-1 text-xs text-amber-700" onClick={() => suspend(d.id)}>
                          Suspend
                        </button>
                      )}
                      <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => remove(d.id)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-customer branding */}
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900">Customer branding</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set the white-label branding shown on a customer&apos;s custom domain.
        </p>
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">Customer</label>
          <select className="input max-w-md" value={brandingId} onChange={(e) => pickBrandingCustomer(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </div>

        {brandingId && (
          <form onSubmit={saveBranding} className="mt-4 grid gap-3 sm:grid-cols-2">
            {BRANDING_FIELDS.map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
                <input
                  className="input"
                  value={branding[key] || ''}
                  onChange={(e) => setBranding((b) => ({ ...b, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={savingBrand}>
                {savingBrand ? 'Saving…' : 'Save branding'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
