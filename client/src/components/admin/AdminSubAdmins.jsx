import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service.js';
import { formatDate } from '../../utils/format.js';

export default function AdminSubAdmins() {
  const [subAdmins, setSubAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    youtubeCredits: 0,
    serverCredits: 0,
  });

  const load = () => {
    setLoading(true);
    adminService
      .listSubAdmins()
      .then(setSubAdmins)
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
      await adminService.createSubAdmin({
        ...form,
        youtubeCredits: Number(form.youtubeCredits) || 0,
        serverCredits: Number(form.serverCredits) || 0,
      });
      setCreated({ email: form.email, password: form.password });
      setForm({ name: '', email: '', phone: '', password: '', youtubeCredits: 0, serverCredits: 0 });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (s) => {
    try {
      await adminService.updateSubAdmin(s.id, { isActive: !s.isActive });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (s) => {
    const pw = window.prompt(`New password for ${s.email} (min 6 chars):`);
    if (!pw) return;
    try {
      await adminService.updateSubAdmin(s.id, { password: pw });
      window.alert('Password updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  const adjust = async (s, type) => {
    const raw = window.prompt(
      `Adjust ${type} credits for ${s.email}.\nEnter a positive number to add, negative to remove:`,
      '1'
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      await adminService.adjustCredits(s.id, { type, amount });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete sub admin ${s.email}? This cannot be undone.`)) return;
    try {
      await adminService.deleteSubAdmin(s.id);
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
          <h2 className="text-lg font-bold text-slate-900">Create sub admin</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">YouTube credits</label>
              <input
                name="youtubeCredits"
                type="number"
                min={0}
                className="input"
                value={form.youtubeCredits}
                onChange={change}
              />
            </div>
            <div>
              <label className="label">Server credits</label>
              <input
                name="serverCredits"
                type="number"
                min={0}
                className="input"
                value={form.serverCredits}
                onChange={change}
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={creating}>
            {creating ? 'Creating…' : 'Create sub admin'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="lg:col-span-2">
        <div className="card">
          <h2 className="text-lg font-bold text-slate-900">Sub admins ({subAdmins.length})</h2>
          {loading ? (
            <p className="mt-4 text-slate-500">Loading…</p>
          ) : subAdmins.length === 0 ? (
            <p className="mt-4 text-slate-600">No sub admins yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {subAdmins.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800">
                        {s.name}
                        {!s.isActive && (
                          <span className="badge bg-red-100 text-red-700">Disabled</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">
                        {s.email}
                        {s.phone ? ` · ${s.phone}` : ''} · joined {formatDate(s.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge bg-brand-100 text-brand-700">
                        YT {s.credits?.youtube ?? 0}
                      </span>
                      <span className="badge bg-gold-100 text-gold-700">
                        SRV {s.credits?.server ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-outline" onClick={() => adjust(s, 'youtube')}>
                      ± YouTube
                    </button>
                    <button type="button" className="btn-outline" onClick={() => adjust(s, 'server')}>
                      ± Server
                    </button>
                    <button type="button" className="btn-outline" onClick={() => toggleActive(s)}>
                      {s.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => resetPassword(s)}>
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="btn-outline text-red-600"
                      onClick={() => remove(s)}
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
