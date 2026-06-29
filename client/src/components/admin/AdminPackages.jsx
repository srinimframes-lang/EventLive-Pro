import { useEffect, useState } from 'react';
import { packageService } from '../../services/package.service.js';
import { formatCurrency } from '../../utils/format.js';

const EMPTY = {
  name: '',
  price: '',
  description: '',
  features: '',
  durationLabel: '',
  isActive: true,
  sortOrder: 0,
};

export default function AdminPackages() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // id or 'new'
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    packageService
      .list()
      .then(setPackages)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startNew = () => {
    setEditing('new');
    setForm(EMPTY);
  };

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({
      name: p.name,
      price: p.price,
      description: p.description || '',
      features: (p.features || []).join('\n'),
      durationLabel: p.durationLabel || '',
      isActive: p.isActive,
      sortOrder: p.sortOrder || 0,
    });
  };

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      price: Number(form.price) || 0,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      if (editing === 'new') await packageService.create(payload);
      else await packageService.update(editing, payload);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete package "${p.name}"?`)) return;
    try {
      await packageService.remove(p.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Packages</h2>
        <button type="button" className="btn-primary" onClick={startNew}>
          + New package
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {editing && (
        <form onSubmit={save} className="card mb-6 space-y-3">
          <h3 className="font-bold text-slate-900">
            {editing === 'new' ? 'New package' : 'Edit package'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input name="name" className="input" required value={form.name} onChange={change} />
            </div>
            <div>
              <label className="label">Price (INR)</label>
              <input
                name="price"
                type="number"
                className="input"
                required
                value={form.price}
                onChange={change}
              />
            </div>
            <div>
              <label className="label">Duration label</label>
              <input
                name="durationLabel"
                className="input"
                placeholder="Up to 6 hours"
                value={form.durationLabel}
                onChange={change}
              />
            </div>
            <div>
              <label className="label">Sort order</label>
              <input
                name="sortOrder"
                type="number"
                className="input"
                value={form.sortOrder}
                onChange={change}
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              name="description"
              rows="2"
              className="input"
              value={form.description}
              onChange={change}
            />
          </div>
          <div>
            <label className="label">Features (one per line)</label>
            <textarea
              name="features"
              rows="4"
              className="input"
              value={form.features}
              onChange={change}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={change} />
            Active (visible to customers)
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-xl font-bold text-slate-900">{p.name}</h3>
                {!p.isActive && <span className="badge bg-slate-100 text-slate-500">Hidden</span>}
              </div>
              <p className="mt-1 text-2xl font-extrabold text-brand-700">
                {formatCurrency(p.price, p.currency)}
              </p>
              {p.durationLabel && <p className="text-sm text-slate-500">{p.durationLabel}</p>}
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(p.features || []).map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn-outline" onClick={() => startEdit(p)}>
                  Edit
                </button>
                <button type="button" className="btn-outline text-red-600" onClick={() => remove(p)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
