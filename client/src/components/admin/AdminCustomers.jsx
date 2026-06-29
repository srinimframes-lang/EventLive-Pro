import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatDate } from '../../utils/format.js';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [created, setCreated] = useState(null);

  const load = () => {
    setLoading(true);
    adminService
      .listCustomers()
      .then((data) =>
        setCustomers(
          [...data].sort((a, b) => (a.approved === b.approved ? 0 : a.approved ? 1 : -1))
        )
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await adminService.createCustomer(form);
      setCreated({ email: form.email, password: form.password });
      setForm({ name: '', email: '', phone: '', password: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await adminService.updateCustomer(c.id, { isActive: !c.isActive });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleApproved = async (c) => {
    try {
      await adminService.updateCustomer(c.id, { approved: !c.approved });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const adjustCredits = async (c, sign) => {
    const raw = window.prompt(
      `${sign > 0 ? 'Add' : 'Remove'} how many credits for ${c.email}? (current: ${c.creditBalance ?? 0})`
    );
    if (raw === null) return;
    const amount = Math.abs(parseInt(raw, 10)) * sign;
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      await adminService.adjustCustomerCredits(c.id, amount);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (c) => {
    const pw = window.prompt(`New password for ${c.email} (min 6 chars):`);
    if (!pw) return;
    try {
      await adminService.updateCustomer(c.id, { password: pw });
      window.alert('Password updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete customer ${c.email}? This cannot be undone.`)) return;
    try {
      await adminService.deleteCustomer(c.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Create form */}
      <div className="lg:col-span-1">
        <form onSubmit={create} className="card space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Create customer account</h2>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {created && (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Account created. Share these credentials:
              <br />
              <strong>{created.email}</strong> / <strong>{created.password}</strong>
            </div>
          )}
          <div>
            <label className="label">Full name</label>
            <input name="name" className="input" required value={form.name} onChange={change} />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              name="email"
              type="email"
              className="input"
              required
              value={form.email}
              onChange={change}
            />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input name="phone" className="input" value={form.phone} onChange={change} />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input
              name="password"
              className="input"
              required
              minLength={6}
              value={form.password}
              onChange={change}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={creating}>
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="lg:col-span-2">
        <div className="card">
          <h2 className="text-lg font-bold text-slate-900">Customers ({customers.length})</h2>
          {loading ? (
            <p className="mt-4 text-slate-500">Loading…</p>
          ) : customers.length === 0 ? (
            <p className="mt-4 text-slate-600">No customers yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {customers.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800">
                      {c.name}
                      {c.approved ? (
                        <span className="badge bg-green-100 text-green-700">Approved</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-700">Pending</span>
                      )}
                      {!c.isActive && (
                        <span className="badge bg-red-100 text-red-700">Deactivated</span>
                      )}
                      <span className="badge bg-brand-100 text-brand-700">
                        {c.creditBalance ?? 0} credits
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''} · joined {formatDate(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-outline" onClick={() => adjustCredits(c, 1)}>
                      + Credits
                    </button>
                    <button type="button" className="btn-outline" onClick={() => adjustCredits(c, -1)}>
                      − Credits
                    </button>
                    <button
                      type="button"
                      className={c.approved ? 'btn-outline' : 'btn-primary'}
                      onClick={() => toggleApproved(c)}
                    >
                      {c.approved ? 'Unapprove' : 'Approve'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => toggleActive(c)}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => resetPassword(c)}>
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="btn-outline text-red-600"
                      onClick={() => remove(c)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
