import { useEffect, useRef, useState } from 'react';
import { bannerService, BANNER_LOCATIONS } from '../../services/banner.service.js';
import {
  BANNER_MEDIA_ACCEPT,
  bannerMediaTypeFromFile,
  validateBannerMediaFile,
} from '../../utils/bannerMedia.js';
import BannerMediaPreview from '../BannerMediaPreview.jsx';

const EMPTY = {
  companyName: '',
  clickUrl: '',
  phoneNumber: '',
  whatsappNumber: '',
  mobileSize: '50',
  locations: [],
  startDate: '',
  endDate: '',
  enabled: true,
  priority: 0,
};

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef(null);
  const pendingImageRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMediaType, setPreviewMediaType] = useState('image');

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await bannerService.adminList();
      setBanners(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCreate = () => {
    pendingImageRef.current = null;
    setPreviewUrl('');
    setPreviewMediaType('image');
    setEditing('new');
    setForm(EMPTY);
  };

  const startEdit = (b) => {
    pendingImageRef.current = null;
    setPreviewUrl(b.imageUrl || '');
    setPreviewMediaType(b.mediaType === 'video' ? 'video' : 'image');
    setEditing(b.id);
    setForm({
      companyName: b.companyName || '',
      clickUrl: b.clickUrl || '',
      phoneNumber: b.phoneNumber || '',
      whatsappNumber: b.whatsappNumber || '',
      mobileSize: b.mobileSize === '100' ? '100' : '50',
      locations: b.locations || [],
      startDate: toDateInput(b.startDate),
      endDate: toDateInput(b.endDate),
      enabled: b.enabled !== false,
      priority: b.priority || 0,
    });
  };

  const cancelEdit = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    pendingImageRef.current = null;
    setEditing(null);
    setForm(EMPTY);
    setPreviewUrl('');
    setPreviewMediaType('image');
  };

  const toggleLocation = (loc) => {
    setForm((f) => ({
      ...f,
      locations: f.locations.includes(loc)
        ? f.locations.filter((l) => l !== loc)
        : [...f.locations, loc],
    }));
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateBannerMediaFile(file);
    if (validationError) {
      setError(validationError);
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    pendingImageRef.current = file;
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewMediaType(bannerMediaTypeFromFile(file) || 'image');
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      setError('Company name is required');
      return;
    }
    if (editing === 'new' && !pendingImageRef.current) {
      setError('Banner image or video is required');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        const fd = new FormData();
        fd.append('image', pendingImageRef.current);
        fd.append('companyName', form.companyName.trim());
        fd.append('clickUrl', form.clickUrl.trim());
        fd.append('phoneNumber', form.phoneNumber.trim());
        fd.append('whatsappNumber', form.whatsappNumber.trim());
        fd.append('mobileSize', form.mobileSize);
        fd.append('locations', JSON.stringify(form.locations));
        fd.append('startDate', form.startDate || '');
        fd.append('endDate', form.endDate || '');
        fd.append('enabled', String(form.enabled));
        fd.append('priority', String(form.priority || 0));
        await bannerService.adminCreate(fd);
        flash('Banner created');
      } else {
        await bannerService.adminUpdate(editing, {
          companyName: form.companyName.trim(),
          clickUrl: form.clickUrl.trim(),
          phoneNumber: form.phoneNumber.trim(),
          whatsappNumber: form.whatsappNumber.trim(),
          mobileSize: form.mobileSize,
          locations: form.locations,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          enabled: form.enabled,
          priority: Number(form.priority) || 0,
        });
        if (pendingImageRef.current) {
          setUploading(true);
          await bannerService.adminUploadImage(editing, pendingImageRef.current);
          setUploading(false);
        }
        flash('Banner updated');
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this banner?')) return;
    setBusy(true);
    try {
      await bannerService.adminDelete(id);
      flash('Banner deleted');
      if (editing === id) cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Banner advertisements</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage responsive banner ads for homepage, live player, gallery, and footer. Upload
            images (JPG, PNG, WebP up to 8 MB) or videos (MP4, WebM up to 10 MB).
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate} disabled={busy}>
          New banner
        </button>
      </div>

      {notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {editing && (
        <form onSubmit={save} className="card space-y-4">
          <h3 className="font-bold text-slate-900">
            {editing === 'new' ? 'Create banner' : 'Edit banner'}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Company name *</span>
              <input
                className="input"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                required
                maxLength={120}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Display priority</span>
              <input
                type="number"
                className="input"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
              <span className="mt-1 block text-xs text-slate-400">Higher numbers show first</span>
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Banner media *</span>
            <div className="flex flex-wrap items-start gap-4">
              {(previewUrl || editing !== 'new') && (
                <BannerMediaPreview
                  src={previewUrl}
                  mediaType={previewMediaType}
                />
              )}
              <div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={BANNER_MEDIA_ACCEPT}
                  onChange={handleImagePick}
                  className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Images: JPG, PNG, WebP (max 8 MB) · Videos: MP4, WebM (max 10 MB, autoplay muted)
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Click URL</span>
              <input
                className="input"
                type="url"
                placeholder="https://example.com"
                value={form.clickUrl}
                onChange={(e) => setForm((f) => ({ ...f, clickUrl: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Mobile banner height</span>
              <select
                className="input"
                value={form.mobileSize}
                onChange={(e) => setForm((f) => ({ ...f, mobileSize: e.target.value }))}
              >
                <option value="50">320 × 50</option>
                <option value="100">320 × 100</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Phone number</span>
              <input
                className="input"
                type="tel"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">WhatsApp number</span>
              <input
                className="input"
                type="tel"
                value={form.whatsappNumber}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Start date</span>
              <input
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">End date</span>
              <input
                type="date"
                className="input"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Display locations</legend>
            <div className="flex flex-wrap gap-3">
              {BANNER_LOCATIONS.map((loc) => (
                <label key={loc.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.locations.includes(loc.id)}
                    onChange={() => toggleLocation(loc.id)}
                  />
                  {loc.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            Enabled
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy || uploading}>
              {busy || uploading ? 'Saving…' : editing === 'new' ? 'Create banner' : 'Save changes'}
            </button>
            <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Loading banners…</p>
      ) : banners.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No banners yet. Create one to start showing ads on your site.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Preview</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Locations</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Stats</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {banners.map((b) => (
                <tr key={b.id} className="bg-white">
                  <td className="px-4 py-3">
                    {b.imageUrl ? (
                      <BannerMediaPreview banner={b} compact className="h-10 w-24 object-contain" />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{b.companyName}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{b.mediaType || 'image'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {(b.locations || []).map((l) => (
                      <span key={l} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        {l}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3">{b.priority ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.views ?? 0} views · {b.clicks ?? 0} clicks
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        b.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {b.enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => startEdit(b)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-red-600 hover:underline"
                      onClick={() => remove(b.id)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
