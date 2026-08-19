import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { eventService, LIVE_LINK_EVENT_TYPES } from '../services/event.service.js';
import {
  buildWatchUrl,
  extractYouTubeId,
  resolveMediaUrl,
  toDateTimeLocal,
} from '../utils/format.js';
import ShareButtons from '../components/ShareButtons.jsx';

const EMPTY = {
  title: '',
  groomName: '',
  brideName: '',
  category: 'wedding',
  eventDate: '',
  eventTime: '',
  youtubeUrl: '',
  description: '',
};

function splitDateTime(iso) {
  const local = toDateTimeLocal(iso);
  if (!local) return { eventDate: '', eventTime: '' };
  const [eventDate, eventTime] = local.split('T');
  return { eventDate: eventDate || '', eventTime: (eventTime || '').slice(0, 5) };
}

function ownerIdOf(event) {
  return String(event?.organizer?.id || event?.organizer?._id || event?.organizer || '');
}

export default function CreateLiveLink() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const fileRef = useRef(null);

  const [form, setForm] = useState(EMPTY);
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const [existingThumb, setExistingThumb] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    eventService
      .get(id)
      .then((event) => {
        if (!active) return;
        const mine = ownerIdOf(event) === String(user?.id);
        if (!mine && !isAdmin) {
          setError('You do not have permission to edit this live link.');
          return;
        }
        const { eventDate, eventTime } = splitDateTime(event.startTime);
        setForm({
          title: event.title || '',
          groomName: event.groomName || '',
          brideName: event.brideName || '',
          category: event.category || 'wedding',
          eventDate,
          eventTime,
          youtubeUrl: (() => {
            const ytId = extractYouTubeId(event.youtubeVideoId);
            const watch = event.youtubeWatchUrl || '';
            const stream = event.streamUrl || '';
            if (ytId && extractYouTubeId(watch) === ytId) return watch;
            if (ytId && extractYouTubeId(stream) === ytId) return stream;
            if (ytId) return `https://youtu.be/${ytId}`;
            return watch || stream || '';
          })(),
          description: event.description || '',
        });
        setExistingThumb(event.coverImage || event.shareThumbnail || '');
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit, isAdmin, user?.id]);

  useEffect(() => {
    return () => {
      if (thumbPreview.startsWith('blob:')) URL.revokeObjectURL(thumbPreview);
    };
  }, [thumbPreview]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleThumb = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (thumbPreview.startsWith('blob:')) URL.revokeObjectURL(thumbPreview);
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  };

  const rawYoutubeUrl = (form.youtubeUrl || '').trim();
  const youtubeId = extractYouTubeId(rawYoutubeUrl);
  const namesOk = Boolean(form.groomName.trim() || form.brideName.trim());
  const thumbOk = Boolean(thumbFile || existingThumb);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!form.title.trim() || form.title.trim().length < 3) {
      setError('Please enter an event title (at least 3 characters).');
      return;
    }
    if (!namesOk) {
      setError('Please enter the couple or person names.');
      return;
    }
    if (!form.eventDate || !form.eventTime) {
      setError('Please enter the event date and start time.');
      return;
    }
    if (!youtubeId) {
      setError('Please paste a valid YouTube Live URL.');
      return;
    }
    if (!isEdit && !thumbFile) {
      setError('Please upload a thumbnail.');
      return;
    }

    const start = new Date(`${form.eventDate}T${form.eventTime}`);
    if (Number.isNaN(start.getTime())) {
      setError('Please enter a valid date and time.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category || 'wedding',
      status: 'published',
      isOnline: true,
      location: 'Online',
      startTime: start.toISOString(),
      groomName: form.groomName.trim(),
      brideName: form.brideName.trim(),
      streamType: 'youtube',
      linkType: 'youtube',
      streamingDestination: 'youtube',
      streamProvider: 'youtube',
      streamUrl: rawYoutubeUrl,
      youtubeWatchUrl: rawYoutubeUrl,
      youtubeLiveUrl: rawYoutubeUrl,
      youtubeVideoId: youtubeId || rawYoutubeUrl,
    };

    setSubmitting(true);
    try {
      const saved = isEdit
        ? await eventService.update(id, payload)
        : await eventService.create(payload);

      if (thumbFile && saved?.id) {
        const { coverImage } = await eventService.uploadCover(saved.id, thumbFile);
        await eventService.uploadShareThumbnail(saved.id, thumbFile).catch(() => null);
        saved.coverImage = coverImage || saved.coverImage;
      }

      setCreated(saved);
      setExistingThumb(saved.coverImage || saved.shareThumbnail || existingThumb);
      setThumbFile(null);
    } catch (err) {
      setError(err.message || 'Could not generate the live link.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="py-20 text-center text-slate-500">Loading…</p>;
  }

  const liveUrl = created ? buildWatchUrl(created) : '';
  const shareTitle =
    created?.groomName && created?.brideName
      ? `${created.groomName} & ${created.brideName}`
      : created?.title || form.title;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-slate-500">
        <Link to="/dashboard" className="text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">
        {isEdit ? 'Edit live link' : 'Create Live Link'}
      </h1>
      <p className="mt-1 text-slate-600">
        Enter your event details and YouTube Live URL. Your EventLivePro link is generated
        immediately — payment is optional and never required.
      </p>

      {created && liveUrl && (
        <div className="card mt-6 border-green-200 bg-green-50">
          <p className="text-sm font-semibold text-green-800">
            {isEdit ? 'Live link updated' : 'Your EventLivePro live link is ready'}
          </p>
          <p className="mt-2 break-all text-sm font-medium text-slate-800">{liveUrl}</p>
          <p className="mt-1 text-xs text-slate-500">
            This URL stays the same if you edit event details later.
          </p>
          <div className="mt-4">
            <ShareButtons url={liveUrl} title={shareTitle} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={liveUrl} target="_blank" rel="noreferrer" className="btn-primary">
              Open live page
            </a>
            <Link to="/dashboard" className="btn-outline">
              My live links
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card mt-6 space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <Field label="Event title" htmlFor="title" required>
          <input
            id="title"
            name="title"
            className="input"
            required
            minLength={3}
            maxLength={120}
            placeholder="Ravi & Priya Wedding"
            value={form.title}
            onChange={handleChange}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Groom / person name" htmlFor="groomName" required>
            <input
              id="groomName"
              name="groomName"
              className="input"
              required
              maxLength={80}
              placeholder="Ravi"
              value={form.groomName}
              onChange={handleChange}
            />
          </Field>
          <Field label="Bride / second name" htmlFor="brideName">
            <input
              id="brideName"
              name="brideName"
              className="input"
              maxLength={80}
              placeholder="Priya"
              value={form.brideName}
              onChange={handleChange}
            />
          </Field>
        </div>

        <Field label="Event type" htmlFor="category" required>
          <select
            id="category"
            name="category"
            className="input"
            required
            value={form.category}
            onChange={handleChange}
          >
            {LIVE_LINK_EVENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event date" htmlFor="eventDate" required>
            <input
              id="eventDate"
              name="eventDate"
              type="date"
              className="input"
              required
              value={form.eventDate}
              onChange={handleChange}
            />
          </Field>
          <Field label="Event start time" htmlFor="eventTime" required>
            <input
              id="eventTime"
              name="eventTime"
              type="time"
              className="input"
              required
              value={form.eventTime}
              onChange={handleChange}
            />
          </Field>
        </div>

        <Field
          label="YouTube Live URL"
          htmlFor="youtubeUrl"
          required
          hint="Paste an existing YouTube Live or watch URL. No Google login is needed."
        >
          <input
            id="youtubeUrl"
            name="youtubeUrl"
            className="input"
            required
            placeholder="https://youtube.com/live/…  or  https://youtu.be/…"
            value={form.youtubeUrl}
            onChange={handleChange}
          />
          {form.youtubeUrl && (
            <p className="mt-1 text-xs text-slate-500">
              {youtubeId ? `Video ID: ${youtubeId}` : 'Could not detect a YouTube video ID yet.'}
            </p>
          )}
        </Field>

        <Field label="Thumbnail" htmlFor="thumbnail" required={!isEdit}>
          <input
            id="thumbnail"
            ref={fileRef}
            type="file"
            accept="image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
            onChange={handleThumb}
          />
          {(thumbPreview || existingThumb) && (
            <img
              src={thumbPreview || resolveMediaUrl(existingThumb)}
              alt="Thumbnail preview"
              className="mt-3 h-40 w-full rounded-xl object-cover"
            />
          )}
        </Field>

        <Field label="Description (optional)" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={3}
            className="input"
            maxLength={5000}
            placeholder="A short note for your guests"
            value={form.description}
            onChange={handleChange}
          />
        </Field>

        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting || !thumbOk}>
          {submitting
            ? isEdit
              ? 'Saving…'
              : 'Generating link…'
            : isEdit
              ? 'Save changes'
              : 'Generate EventLivePro Live Link'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, htmlFor, required, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
