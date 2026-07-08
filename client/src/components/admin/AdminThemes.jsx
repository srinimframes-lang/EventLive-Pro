import { useEffect, useMemo, useState } from 'react';
import { themeService } from '../../services/theme.service.js';
import { THEME_CATEGORY_LABELS, THEME_CATEGORIES, THEME_REGION_LABELS, THEME_REGIONS } from '../../utils/eventTheme.js';
import { resolveMediaUrl } from '../../utils/format.js';
import ThemePreviewModal from './ThemePreviewModal.jsx';
import AdminThemeDragList from './AdminThemeDragList.jsx';

const EMPTY = {
  name: '',
  category: 'wedding',
  region: '',
  description: '',
  backgroundImage: '',
  heroLabel: 'Live',
  footerText: '',
  isPremium: true,
  isActive: true,
  sortOrder: 0,
  colors: {
    primary: '#be185d',
    secondary: '#9d174d',
    accent: '#f472b6',
    heroText: '#ffffff',
    surface: '#fdf2f8',
    footerBg: '#1e1b4b',
    footerText: '#f8fafc',
  },
  fonts: {
    heading: '"Playfair Display", Georgia, serif',
    body: 'Inter, system-ui, sans-serif',
  },
  style: {
    decoration: 'elegant',
    buttonStyle: 'pill-glow',
    iconSet: 'rings',
    particleStyle: 'bokeh',
    gradientFrom: '',
    gradientTo: '',
    goldBorder: false,
    loadingAnimation: 'gold-shimmer',
    backgroundMusic: '',
  },
};

export default function AdminThemes() {
  const [themes, setThemes] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (m) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 2500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await themeService.adminList(filter || undefined);
      setThemes(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const counts = useMemo(() => {
    const m = {};
    for (const t of themes) m[t.category] = (m[t.category] || 0) + 1;
    return m;
  }, [themes]);

  const startCreate = () => {
    setEditing('new');
    setForm({ ...EMPTY, category: filter || 'wedding' });
  };

  const startEdit = (t) => {
    setEditing(t.id);
    setForm({
      name: t.name,
      category: t.category,
      region: t.region || '',
      description: t.description || '',
      backgroundImage: t.backgroundImage || '',
      heroLabel: t.heroLabel || 'Live',
      footerText: t.footerText || '',
      isPremium: t.isPremium !== false,
      isActive: t.isActive !== false,
      sortOrder: t.sortOrder || 0,
      colors: { ...EMPTY.colors, ...t.colors },
      fonts: { ...EMPTY.fonts, ...t.fonts },
      style: { ...EMPTY.style, ...t.style },
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        await themeService.create(form);
        flash('Theme created');
      } else {
        await themeService.update(editing, form);
        flash('Theme updated');
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this theme? Existing events keep their saved snapshot.')) return;
    try {
      await themeService.remove(id);
      flash('Theme deleted');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onColor = (key, val) =>
    setForm((f) => ({ ...f, colors: { ...f.colors, [key]: val } }));

  const onStyle = (key, val) =>
    setForm((f) => ({ ...f, style: { ...f.style, [key]: val } }));

  const duplicate = async (id) => {
    try {
      await themeService.duplicate(id);
      flash('Theme duplicated');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadBg = async (e) => {
    const file = e.target.files?.[0];
    if (!file || editing === 'new' || !editing) return;
    setBusy(true);
    try {
      const data = await themeService.uploadBackground(editing, file);
      setForm((f) => ({ ...f, backgroundImage: data.backgroundImage }));
      flash('Background uploaded');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  if (loading && !themes.length) return <p className="text-slate-500">Loading themes…</p>;

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Themes</h2>
          <p className="text-sm text-slate-500">
            {themes.length} curated templates
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate}>
          Add theme
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-sm ${!filter ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setFilter('')}
        >
          All
        </button>
        {THEME_CATEGORIES.filter((c) =>
          ['wedding', 'reception', 'sangeet', 'birthday', 'upanayanam', 'half_saree'].includes(c)
        ).map((c) => (
          <button
            key={c}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${filter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => setFilter(c)}
          >
            {THEME_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {editing && (
        <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-base font-bold text-slate-900">
            {editing === 'new' ? 'New theme' : 'Edit theme'}
          </h3>
          <Field label="Name">
            <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {THEME_CATEGORIES.map((c) => (
                <option key={c} value={c}>{THEME_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Region (South Indian)">
            <select className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
              <option value="">None</option>
              {THEME_REGIONS.map((r) => (
                <option key={r} value={r}>{THEME_REGION_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Hero label">
            <input className="input" value={form.heroLabel} onChange={(e) => setForm((f) => ({ ...f, heroLabel: e.target.value }))} />
          </Field>
          <Field label="Background image URL">
            <input className="input" value={form.backgroundImage} onChange={(e) => setForm((f) => ({ ...f, backgroundImage: e.target.value }))} />
            {form.backgroundImage && (
              <img
                src={resolveMediaUrl(form.backgroundImage)}
                alt="Background preview"
                className="mt-2 h-24 w-full rounded-lg border border-slate-200 object-cover"
              />
            )}
          </Field>
          {editing !== 'new' && (
            <Field label="Upload background">
              <input type="file" accept="image/*" className="input text-sm" onChange={uploadBg} disabled={busy} />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>
          </div>
          {['primary', 'secondary', 'accent', 'surface', 'footerBg'].map((k) => (
            <Field key={k} label={`Color: ${k}`}>
              <div className="flex gap-2">
                <input className="input" value={form.colors[k]} onChange={(e) => onColor(k, e.target.value)} />
                <input type="color" className="h-10 w-10 rounded border" value={form.colors[k]} onChange={(e) => onColor(k, e.target.value)} />
              </div>
            </Field>
          ))}
          <Field label="Heading font">
            <input className="input" value={form.fonts.heading} onChange={(e) => setForm((f) => ({ ...f, fonts: { ...f.fonts, heading: e.target.value } }))} />
          </Field>
          <Field label="Body font">
            <input className="input" value={form.fonts.body} onChange={(e) => setForm((f) => ({ ...f, fonts: { ...f.fonts, body: e.target.value } }))} />
          </Field>
          <Field label="Decoration">
            <input className="input" value={form.style.decoration} onChange={(e) => onStyle('decoration', e.target.value)} />
          </Field>
          <Field label="Button style">
            <select className="input" value={form.style.buttonStyle} onChange={(e) => onStyle('buttonStyle', e.target.value)}>
              {['pill-glow', 'glass', 'rounded-gold', 'neon', 'outline-glass', 'sharp'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Icon set">
            <input className="input" value={form.style.iconSet} onChange={(e) => onStyle('iconSet', e.target.value)} />
          </Field>
          <Field label="Particle style">
            <select className="input" value={form.style.particleStyle} onChange={(e) => onStyle('particleStyle', e.target.value)}>
              {['bokeh', 'petals', 'gold-dust', 'neon', 'bubbles', 'stars', 'confetti', 'leaves', 'dust', 'none'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Gradient from">
            <div className="flex gap-2">
              <input className="input" value={form.style.gradientFrom} onChange={(e) => onStyle('gradientFrom', e.target.value)} />
              <input type="color" className="h-10 w-10 rounded border" value={form.style.gradientFrom || form.colors.primary} onChange={(e) => onStyle('gradientFrom', e.target.value)} />
            </div>
          </Field>
          <Field label="Gradient to">
            <div className="flex gap-2">
              <input className="input" value={form.style.gradientTo} onChange={(e) => onStyle('gradientTo', e.target.value)} />
              <input type="color" className="h-10 w-10 rounded border" value={form.style.gradientTo || form.colors.accent} onChange={(e) => onStyle('gradientTo', e.target.value)} />
            </div>
          </Field>
          <Field label="Loading animation">
            <select className="input" value={form.style.loadingAnimation} onChange={(e) => onStyle('loadingAnimation', e.target.value)}>
              {['lotus-spin', 'temple-glow', 'floral-pulse', 'gold-shimmer', 'wave'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Background music URL (optional)">
            <input className="input" value={form.style.backgroundMusic} onChange={(e) => onStyle('backgroundMusic', e.target.value)} placeholder="https://…" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.style.goldBorder} onChange={(e) => onStyle('goldBorder', e.target.checked)} />
            Gold decorative border
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isPremium} onChange={(e) => setForm((f) => ({ ...f, isPremium: e.target.checked }))} />
            Premium theme
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="btn-outline" onClick={() => setPreview({ themeSnapshot: { ...form, name: form.name, style: form.style } })}>
              Preview
            </button>
          </div>
        </form>
      )}

      <AdminThemeDragList
        themes={themes}
        onReorder={load}
        onPreview={(t) => setPreview({ themeSnapshot: t })}
        onEdit={startEdit}
        onDuplicate={duplicate}
        onRemove={remove}
      />

      {preview && (
        <ThemePreviewModal theme={preview.themeSnapshot} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
