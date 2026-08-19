import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { formatDateTime, resolveMediaUrl } from '../utils/format.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_BYTES = 8 * 1024 * 1024;

const EMPTY_FORM = {
  eventTitle: '',
  brideName: '',
  groomName: '',
  weddingDate: '',
  weddingTime: '',
  venue: '',
};

function isAllowedImage(file) {
  if (!file) return false;
  if (ALLOWED_TYPES.has(file.type)) return true;
  return ALLOWED_EXT.test(file.name || '');
}

export default function WeddingCardUpload() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [extracted, setExtracted] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    return () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = (picked) => {
    setError('');
    setSaved(null);
    setExtracted(false);
    setOcrStatus('');
    setForm(EMPTY_FORM);

    if (!picked) return;
    if (!isAllowedImage(picked)) {
      setError('Please choose a JPG, JPEG, PNG or WEBP image.');
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError('Image is too large. Maximum size is 8 MB.');
      return;
    }

    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const onInputChange = (e) => {
    handleFile(e.target.files?.[0] || null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const extractDetails = async () => {
    if (!file || busy) return;
    setError('');
    setBusy('extract');
    try {
      const data = await eventService.extractWeddingCard(file);
      setForm({
        eventTitle: data.eventTitle || '',
        brideName: data.brideName || '',
        groomName: data.groomName || '',
        weddingDate: data.weddingDate || '',
        weddingTime: data.weddingTime || '',
        venue: data.venue || '',
      });
      setOcrStatus(data.ocrStatus || 'ok');
      setExtracted(true);
    } catch (err) {
      setError(err.message || 'Could not read the wedding card.');
    } finally {
      setBusy('');
    }
  };

  const confirmSave = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');

    if (!form.eventTitle.trim() || form.eventTitle.trim().length < 3) {
      setError('Please enter an event title (at least 3 characters).');
      return;
    }
    if (!form.groomName.trim() && !form.brideName.trim()) {
      setError('Please enter the bride or groom name.');
      return;
    }
    if (!form.weddingDate || !form.weddingTime) {
      setError('Please enter the wedding date and time.');
      return;
    }

    setBusy('confirm');
    try {
      const event = await eventService.confirmWeddingCard(
        {
          eventTitle: form.eventTitle.trim(),
          brideName: form.brideName.trim(),
          groomName: form.groomName.trim(),
          weddingDate: form.weddingDate,
          weddingTime: form.weddingTime,
          venue: form.venue.trim(),
        },
        file
      );
      setSaved(event);
    } catch (err) {
      setError(err.message || 'Could not save the wedding details.');
    } finally {
      setBusy('');
    }
  };

  const ocrHint =
    ocrStatus === 'failed'
      ? 'We could not read this image automatically. Please fill in the details below.'
      : ocrStatus === 'empty'
        ? 'Little text was detected. Please fill or correct the details below.'
        : 'Please review and edit every field. Nothing is saved until you confirm.';

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm text-slate-500">
        <Link to="/dashboard" className="text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Upload wedding card</h1>
      <p className="mt-1 text-slate-600">
        Upload an invitation photo. We will try to read the names, date, time and venue — you
        review everything before anything is saved.
      </p>

      {saved ? (
        <div className="card mt-6 border-green-200 bg-green-50">
          <p className="text-sm font-semibold text-green-800">Wedding details saved</p>
          <p className="mt-1 text-sm text-slate-700">{saved.title}</p>
          {(saved.groomName || saved.brideName) && (
            <p className="mt-1 text-sm text-slate-600">
              {saved.groomName || ''}
              {saved.groomName && saved.brideName ? ' & ' : ''}
              {saved.brideName || ''}
            </p>
          )}
          {saved.startTime && (
            <p className="text-sm text-slate-600">{formatDateTime(saved.startTime)}</p>
          )}
          {saved.venue ? <p className="text-sm text-slate-600">{saved.venue}</p> : null}
          {saved.coverImage ? (
            <img
              src={resolveMediaUrl(saved.coverImage)}
              alt="Saved wedding card"
              className="mt-3 max-h-56 w-full rounded-xl object-contain bg-white"
            />
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            No YouTube broadcast or live link was created. You can add a live link later from the
            dashboard.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/dashboard" className="btn-primary">
              Back to dashboard
            </Link>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setSaved(null);
                setExtracted(false);
                setOcrStatus('');
                setForm(EMPTY_FORM);
                setFile(null);
                if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
                setPreview('');
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Upload another card
            </button>
          </div>
        </div>
      ) : null}

      {!saved && (
        <>
          <div className="card mt-6 space-y-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div>
              <label htmlFor="wedding-card-file" className="mb-1 block text-sm font-medium text-slate-700">
                Wedding invitation image
              </label>
              <input
                id="wedding-card-file"
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
                onChange={onInputChange}
              />
              <p className="mt-1 text-xs text-slate-500">JPG, JPEG, PNG or WEBP. Max 8 MB.</p>
            </div>

            {preview ? (
              <img
                src={preview}
                alt="Wedding card preview"
                className="max-h-80 w-full rounded-xl bg-slate-50 object-contain"
              />
            ) : (
              <button
                type="button"
                className="flex min-h-[10rem] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500"
                onClick={() => fileRef.current?.click()}
              >
                <span className="text-sm font-medium text-slate-700">Tap to choose a photo</span>
                <span className="mt-1 text-xs">Your invitation will appear here for preview</span>
              </button>
            )}

            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              disabled={!file || Boolean(busy)}
              onClick={extractDetails}
            >
              {busy === 'extract' ? 'Reading card…' : 'Extract wedding details'}
            </button>
          </div>

          {extracted && (
            <form onSubmit={confirmSave} className="card mt-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Review extracted details</h2>
                <p className="mt-1 text-sm text-slate-600">{ocrHint}</p>
              </div>

              <Field label="Event title" htmlFor="eventTitle" required>
                <input
                  id="eventTitle"
                  name="eventTitle"
                  className="input"
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Event title"
                  value={form.eventTitle}
                  onChange={handleChange}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bride name" htmlFor="brideName">
                  <input
                    id="brideName"
                    name="brideName"
                    className="input"
                    maxLength={80}
                    placeholder="Bride name"
                    value={form.brideName}
                    onChange={handleChange}
                  />
                </Field>
                <Field label="Groom name" htmlFor="groomName">
                  <input
                    id="groomName"
                    name="groomName"
                    className="input"
                    maxLength={80}
                    placeholder="Groom name"
                    value={form.groomName}
                    onChange={handleChange}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Wedding date" htmlFor="weddingDate" required>
                  <input
                    id="weddingDate"
                    name="weddingDate"
                    type="date"
                    className="input"
                    required
                    value={form.weddingDate}
                    onChange={handleChange}
                  />
                </Field>
                <Field label="Wedding time" htmlFor="weddingTime" required>
                  <input
                    id="weddingTime"
                    name="weddingTime"
                    type="time"
                    className="input"
                    required
                    value={form.weddingTime}
                    onChange={handleChange}
                  />
                </Field>
              </div>

              <Field label="Venue" htmlFor="venue">
                <input
                  id="venue"
                  name="venue"
                  className="input"
                  maxLength={200}
                  placeholder="Hotel / mandap / hall"
                  value={form.venue}
                  onChange={handleChange}
                />
              </Field>

              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={Boolean(busy)}>
                {busy === 'confirm' ? 'Saving…' : 'Confirm and save details'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, htmlFor, required, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
    </div>
  );
}
