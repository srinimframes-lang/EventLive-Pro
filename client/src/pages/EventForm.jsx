import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  eventService,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from '../services/event.service.js';
import { toDateTimeLocal } from '../utils/format.js';

const EMPTY = {
  title: '',
  description: '',
  category: 'webinar',
  status: 'draft',
  startTime: '',
  endTime: '',
  isOnline: true,
  location: 'Online',
  streamUrl: '',
  capacity: 0,
  tags: '',
};

export default function EventForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
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
          streamUrl: event.streamUrl || '',
          capacity: event.capacity || 0,
          tags: (event.tags || []).join(', '),
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const payload = {
      ...form,
      capacity: Number(form.capacity) || 0,
      startTime: form.startTime ? new Date(form.startTime).toISOString() : undefined,
      endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
      tags: form.tags
        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
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
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">
        {isEdit ? 'Edit event' : 'Create event'}
      </h1>

      <form onSubmit={handleSubmit} className="card mt-6 space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <Field label="Title" htmlFor="title">
          <input id="title" name="title" required minLength={3} maxLength={120}
            className="input" value={form.title} onChange={handleChange} />
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

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="isOnline" checked={form.isOnline} onChange={handleChange} />
          This is an online event
        </label>

        {form.isOnline ? (
          <Field label="Stream URL" htmlFor="streamUrl">
            <input id="streamUrl" name="streamUrl" type="url" placeholder="https://…"
              className="input" value={form.streamUrl} onChange={handleChange} />
          </Field>
        ) : (
          <Field label="Location" htmlFor="location">
            <input id="location" name="location" className="input"
              value={form.location} onChange={handleChange} />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Capacity (0 = unlimited)" htmlFor="capacity">
            <input id="capacity" name="capacity" type="number" min={0}
              className="input" value={form.capacity} onChange={handleChange} />
          </Field>
          <Field label="Tags (comma separated)" htmlFor="tags">
            <input id="tags" name="tags" placeholder="react, live, 2026"
              className="input" value={form.tags} onChange={handleChange} />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
