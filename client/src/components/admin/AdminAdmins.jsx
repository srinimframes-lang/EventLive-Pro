import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatDate } from '../../utils/format.js';

/**
 * Super Admin only — create and manage tenant Admin accounts.
 */
export default function AdminAdmins() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [created, setCreated] = useState(null);

  const load = () => {
    setLoading(true);
    adminService
      .listAdmins()
      .then(setAdmins)
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
      await adminService.createAdmin(form);
      setCreated({ email: form.email, password: form.password });
      setForm({ name: '', email: '', phone: '', password: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      await adminService.updateAdmin(a.id, { isActive: !a.isActive });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (a) => {
    const pw = window.prompt(`New password for ${a.email} (min 6 chars):`);
    if (!pw) return;
    try {
      await adminService.updateAdmin(a.id, { password: pw });
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete tenant admin ${a.email}? Their data stays but they lose access.`)) {
      return;
    }
    try {
      await adminService.deleteAdmin(a.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <section className="card space-y-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">Create tenant Admin</h2>
        <p className="text-sm text-slate-600">
          Tenant admins only see customers, events, bookings and payments they create.
        </p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {created && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Created {created.email}. Share the password securely, then ask them to change it.
          </p>
        )}
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            required
            placeholder="Name"
            className="input"
            value={form.name}
            onChange={change}
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="input"
            value={form.email}
            onChange={change}
          />
          <input
            name="phone"
            placeholder="Phone"
            className="input"
            value={form.phone}
            onChange={change}
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8)"
            className="input"
            value={form.password}
            onChange={change}
          />
          <button type="submit" className="btn-primary sm:col-span-2" disabled={creating}>
            {creating ? 'Creating…' : 'Create Admin'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold text-slate-900">Tenant Admins</h2>
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="text-slate-500">No tenant admins yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`badge ${a.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {a.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{formatDate(a.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-ghost text-xs" onClick={() => toggleActive(a)}>
                          {a.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" className="btn-ghost text-xs" onClick={() => resetPassword(a)}>
                          Reset password
                        </button>
                        <button type="button" className="btn-ghost text-xs text-red-600" onClick={() => remove(a)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
