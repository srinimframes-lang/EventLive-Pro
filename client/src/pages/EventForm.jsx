import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  eventService,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from '../services/event.service.js';
import { toDateTimeLocal, extractYouTubeId } from '../utils/format.js';

const EMPTY = {
  title: '',
  description: '',
  category: 'webinar',
  status: 'draft',
  startTime: '',
  endTime: '',
  isOnline: true,
  location: 'Online',
  youtubeUrl: '',
  capacity: 0,
  tags: '',
  brideName: '',
  groomName: '',
  photographerName: '',
  photographerLogo: '',
};

export default function EventForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const logoInputRef = useRef(null);

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    eventService
      .get(id)
      .then((event) => {
        if (!active) return;
        setForm({
          title: event.title || '',
          description: event.description || '',
          category: event.category || 'webinar',
          status: event.status || 'draft',
          startTime: toDateTimeLocal(event.startTime),
          endTime: toDateTimeLocal(event.endTime),
          isOnline: event.isOnline ?? true,
          location: event.location || 'Online',
          youtubeUrl: event.youtubeVideoId
            ? `https://youtu.be/${event.youtubeVideoId}`
            : event.streamUrl || '',
          capacity: event.capacity || 0,
          tags: (event.tags || []).join(', '),
          brideName: event.brideName || '',
          groomName: event.groomName || '',
          photographerName: event.photographerName || '',
          photographerLogo: event.photographerLogo || '',
        });
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isEdit) {
      setError('Save the event first, then upload a logo.');
      return;
    }
    setUploadingLogo(true);
    setError('');
    try {
      const { photographerLogo } = await eventService.uploadLogo(id, file);
      setForm((f) => ({ ...f, photographerLogo }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const youtubeVideoId = form.isOnline ? extractYouTubeId(form.youtubeUrl) : '';

    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      status: form.status,
      isOnline: form.isOnline,
      location: form.isOnline ? 'Online' : form.location,
      capacity: Number(form.capacity) || 0,
      startTime: form.startTime ? new Date(form.startTime).toISOString() : undefined,
      endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
      tags: form.tags
        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
      brideName: form.brideName,
      groomName: form.groomName,
      photographerName: form.photographerName,
      streamUrl: form.isOnline ? form.youtubeUrl : '',
      youtubeVideoId,
      streamProvider: youtubeVideoId ? 'youtube' : 'none',
    };

    try {
      const saved = isEdit
        ? await eventService.update(id, payload)
        : await eventService.create(payload);
      navigate(`/events/${saved.slug || saved.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) return <p className="py-20 text-center text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
        {isEdit ? 'Edit event' : 'Create event'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Fill in the details below. Fields marked with sections help you set up a
        beautiful live wedding broadcast.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* ── Basics ─────────────────────────────────────────── */}
        <Section title="Event details">
          <Field label="Title" htmlFor="title">
            <input id="title" name="title" required minLength={3} maxLength={120}
              className="input" value={form.title} onChange={handleChange}
              placeholder="e.g. Aarav & Priya — Wedding Live" />
          </Field>

          <Field label="Description" htmlFor="description">
            <textarea id="description" name="description" required rows={5}
              className="input" value={form.description} onChange={handleChange} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category">
              <select id="category" name="category" className="input capitalize"
                value={form.category} onChange={handleChange}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" className="input capitalize"
                value={form.status} onChange={handleChange}>
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time" htmlFor="startTime">
              <input id="startTime" name="startTime" type="datetime-local" required
                className="input" value={form.startTime} onChange={handleChange} />
            </Field>
            <Field label="End time" htmlFor="endTime">
              <input id="endTime" name="endTime" type="datetime-local" required
                className="input" value={form.endTime} onChange={handleChange} />
            </Field>
          </div>
        </Section>

        {/* ── Couple ─────────────────────────────────────────── */}
        <Section title="The couple" subtitle="Shown on the live watch page.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bride's name" htmlFor="brideName">
              <input id="brideName" name="brideName" className="input" maxLength={80}
                placeholder="e.g. Priya" value={form.brideName} onChange={handleChange} />
            </Field>
            <Field label="Groom's name" htmlFor="groomName">
              <input id="groomName" name="groomName" className="input" maxLength={80}
                placeholder="e.g. Aarav" value={form.groomName} onChange={handleChange} />
            </Field>
          </div>
        </Section>

        {/* ── Streaming ──────────────────────────────────────── */}
        <Section title="Live stream">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="isOnline" checked={form.isOnline} onChange={handleChange} />
            This is an online event (live streamed)
          </label>

          {form.isOnline ? (
            <Field
              label="YouTube Live link"
              htmlFor="youtubeUrl"
              hint="Paste the YouTube Live URL or video ID. It will be embedded directly on the in-app watch page."
            >
              <input id="youtubeUrl" name="youtubeUrl" type="text"
                placeholder="https://youtube.com/live/…  or  https://youtu.be/…"
                className="input" value={form.youtubeUrl} onChange={handleChange} />
              {form.isOnline && form.youtubeUrl && (
                <p className="mt-1 text-xs text-slate-400">
                  {extractYouTubeId(form.youtubeUrl)
                    ? `Detected video ID: ${extractYouTubeId(form.youtubeUrl)}`
                    : 'Could not detect a YouTube video ID yet.'}
                </p>
              )}
            </Field>
          ) : (
            <Field label="Venue / location" htmlFor="location">
              <input id="location" name="location" className="input"
                value={form.location} onChange={handleChange} />
            </Field>
          )}
        </Section>

        {/* ── Photography branding ───────────────────────────── */}
        <Section title="Photography branding" subtitle="Optional studio credit & logo.">
          <Field label="Photographer / studio name" htmlFor="photographerName">
            <input id="photographerName" name="photographerName" className="input" maxLength={120}
              placeholder="e.g. Moments by Studio X" value={form.photographerName} onChange={handleChange} />
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Logo</span>
            <div className="flex flex-wrap items-center gap-4">
              {form.photographerLogo ? (
                <img
                  src={form.photographerLogo}
                  alt="Photography logo"
                  className="h-16 w-16 rounded-lg border border-slate-200 object-contain p-1"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                  No logo
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                  disabled={uploadingLogo}
                />
                <p className="mt-1 text-xs text-slate-400">
                  {isEdit
                    ? uploadingLogo
                      ? 'Uploading…'
                      : 'PNG/JPG/SVG, up to 8 MB.'
                    : 'Save the event first to enable logo upload.'}
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Extras ─────────────────────────────────────────── */}
        <Section title="More">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capacity (0 = unlimited)" htmlFor="capacity">
              <input id="capacity" name="capacity" type="number" min={0}
                className="input" value={form.capacity} onChange={handleChange} />
            </Field>
            <Field label="Tags (comma separated)" htmlFor="tags">
              <input id="tags" name="tags" placeholder="wedding, live, 2026"
                className="input" value={form.tags} onChange={handleChange} />
            </Field>
          </div>
        </Section>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="px-1 text-base font-bold text-slate-900">{title}</legend>
      {subtitle && <p className="-mt-2 text-xs text-slate-500">{subtitle}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
