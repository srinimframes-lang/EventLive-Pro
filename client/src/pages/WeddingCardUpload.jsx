import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { buildWatchUrl, resolveMediaUrl } from '../utils/format.js';
import ShareButtons from '../components/ShareButtons.jsx';
import YoutubeConnectCard from '../components/YoutubeConnectCard.jsx';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const POLL_MS = 3000;
const POLL_BUDGET_MS = 120_000;

const EMPTY_FORM = {
  brideName: '',
  groomName: '',
  weddingDate: '',
  weddingTime: '',
  venue: '',
};

const PHASES = [
  { id: 'upload', label: 'Uploading wedding card…' },
  { id: 'read', label: 'Reading wedding card…' },
  { id: 'prepare', label: 'Preparing wedding details…' },
  { id: 'youtube', label: 'Creating YouTube Live…' },
  { id: 'link', label: 'Generating live link…' },
  { id: 'ready', label: 'Live link ready' },
];

function isAllowedImage(file) {
  if (!file) return false;
  if (ALLOWED_TYPES.has(file.type)) return true;
  return ALLOWED_EXT.test(file.name || '');
}

function wedsTitle(groom, bride) {
  const g = String(groom || '').trim();
  const b = String(bride || '').trim();
  return g && b ? `${g} Weds ${b}` : '';
}

export default function WeddingCardUpload() {
  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [extracted, setExtracted] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const title = useMemo(
    () => wedsTitle(form.groomName, form.brideName),
    [form.groomName, form.brideName]
  );

  useEffect(() => {
    return () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [preview]);

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const applyResult = (payload) => {
    const event = payload?.data || payload;
    const liveUrl = payload?.liveUrl || (event ? buildWatchUrl(event) : '');
    setResult({
      ...payload,
      event,
      liveUrl,
      title: payload?.title || event?.title || title,
    });
    if (payload?.status === 'ready' && liveUrl) setPhase('ready');
  };

  const pollUntilReady = (eventId) => {
    stopPoll();
    const started = Date.now();
    setPhase('link');
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > POLL_BUDGET_MS) {
        stopPoll();
        setError('Wedding details saved. YouTube Live link is being generated.');
        return;
      }
      try {
        const payload = await eventService.weddingCardStatus(eventId);
        if (payload?.status === 'ready' && (payload.liveUrl || payload.data)) {
          stopPoll();
          applyResult(payload);
        }
      } catch {
        // Keep polling until the budget expires.
      }
    }, POLL_MS);
  };

  const handleFile = (picked) => {
    setError('');
    setResult(null);
    setExtracted(false);
    setNeedsReview(false);
    setOcrStatus('');
    setPhase('');
    setForm(EMPTY_FORM);
    stopPoll();

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

  const extractDetails = async () => {
    if (!file || phase) return;
    setError('');
    setPhase('upload');
    try {
      setPhase('read');
      const data = await eventService.extractWeddingCard(file);
      setPhase('prepare');
      setForm({
        brideName: data.brideName || '',
        groomName: data.groomName || '',
        weddingDate: data.weddingDate || '',
        weddingTime: data.weddingTime || '',
        venue: data.venue || '',
      });
      setOcrStatus(data.ocrStatus || 'ok');
      setNeedsReview(Boolean(data.needsReview));
      setExtracted(true);
      setPhase('');
      if (data.needsReview) {
        setError('Please review the wedding details before creating the live link.');
      }
    } catch (err) {
      setError(err.message || 'Could not read the wedding card.');
      setPhase('');
    }
  };

  const confirmSave = async (e) => {
    e.preventDefault();
    if (phase) return;
    setError('');

    if (!wedsTitle(form.groomName, form.brideName)) {
      setError('Please review the wedding details before creating the live link.');
      return;
    }
    if (!form.weddingDate) {
      setError('Please enter the wedding date.');
      return;
    }

    setPhase('youtube');
    try {
      const payload = await eventService.confirmWeddingCard(
        {
          brideName: form.brideName.trim(),
          groomName: form.groomName.trim(),
          weddingDate: form.weddingDate,
          weddingTime: form.weddingTime,
          venue: form.venue.trim(),
        },
        file
      );
      applyResult(payload);
      const eventId = payload.eventId || payload.data?.id;
      if (payload.status === 'ready') {
        setPhase('ready');
      } else if (eventId) {
        pollUntilReady(eventId);
      } else {
        setError(payload.message || 'Wedding details saved. YouTube Live link is being generated.');
        setPhase('');
      }
    } catch (err) {
      setError(err.message || 'Please review the wedding details before creating the live link.');
      setPhase('');
    }
  };

  const liveUrl = result?.liveUrl || '';
  const savedEvent = result?.event;
  const phaseIndex = PHASES.findIndex((item) => item.id === phase);
  const showProgress = Boolean(phase) && phase !== 'ready';

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm text-slate-500">
        <Link to="/dashboard" className="text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Upload wedding card</h1>
      <p className="mt-1 text-slate-600">
        Upload an invitation photo. We read the names and date, then create your EventLivePro live
        link using your connected YouTube account.
      </p>

      {showProgress && (
        <div className="card mt-6">
          <p className="text-sm font-semibold text-slate-900">
            {PHASES[phaseIndex]?.label || 'Working…'}
          </p>
          <ol className="mt-3 space-y-1 text-sm text-slate-600">
            {PHASES.map((item, index) => (
              <li key={item.id} className={index <= phaseIndex ? 'font-medium text-brand-700' : ''}>
                {index < phaseIndex ? '✓' : index === phaseIndex ? '→' : '•'} {item.label}
              </li>
            ))}
          </ol>
        </div>
      )}

      {phase === 'ready' && result ? (
        <div className="card mt-6 border-green-200 bg-green-50">
          <p className="text-sm font-semibold text-green-800">Live link ready</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{result.title}</p>
          {liveUrl ? <p className="mt-2 break-all text-sm text-slate-700">{liveUrl}</p> : null}
          {liveUrl ? (
            <div className="mt-3">
              <ShareButtons url={liveUrl} title={result.title} />
            </div>
          ) : null}
          {savedEvent?.coverImage ? (
            <img
              src={resolveMediaUrl(savedEvent.coverImage)}
              alt="Wedding card"
              className="mt-3 max-h-56 w-full rounded-xl bg-white object-contain"
            />
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/dashboard" className="btn-primary">
              Back to dashboard
            </Link>
            {liveUrl ? (
              <a href={liveUrl} className="btn-outline" target="_blank" rel="noreferrer">
                Open live page
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {result && phase !== 'ready' && result.status === 'provisioning' && !showProgress ? (
        <div className="card mt-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            Wedding details saved. YouTube Live link is being generated.
          </p>
          {result.title ? <p className="mt-1 text-sm text-slate-700">{result.title}</p> : null}
          {liveUrl ? <p className="mt-2 break-all text-xs text-slate-500">{liveUrl}</p> : null}
        </div>
      ) : null}

      {phase !== 'ready' && (
        <>
          <div className="mt-8">
            <YoutubeConnectCard returnTo="/wedding-card" />
          </div>

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
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
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
              disabled={!file || Boolean(phase)}
              onClick={extractDetails}
            >
              Extract wedding details
            </button>
          </div>

          {extracted && (
            <form onSubmit={confirmSave} className="card mt-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Review wedding details</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {needsReview || ocrStatus !== 'ok'
                    ? 'Please review the wedding details before creating the live link.'
                    : 'Edit anything that looks wrong. The live title is generated from the names.'}
                </p>
              </div>

              <Field label="Live title">
                <input className="input bg-slate-50" readOnly value={title || 'Enter groom and bride names'} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Groom name" htmlFor="groomName" required>
                  <input
                    id="groomName"
                    name="groomName"
                    className="input"
                    maxLength={80}
                    placeholder="Groom name"
                    value={form.groomName}
                    onChange={(e) => setForm((current) => ({ ...current, groomName: e.target.value }))}
                  />
                </Field>
                <Field label="Bride name" htmlFor="brideName" required>
                  <input
                    id="brideName"
                    name="brideName"
                    className="input"
                    maxLength={80}
                    placeholder="Bride name"
                    value={form.brideName}
                    onChange={(e) => setForm((current) => ({ ...current, brideName: e.target.value }))}
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
                    onChange={(e) => setForm((current) => ({ ...current, weddingDate: e.target.value }))}
                  />
                </Field>
                <Field label="Wedding time" htmlFor="weddingTime">
                  <input
                    id="weddingTime"
                    name="weddingTime"
                    type="time"
                    className="input"
                    value={form.weddingTime}
                    onChange={(e) => setForm((current) => ({ ...current, weddingTime: e.target.value }))}
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
                  onChange={(e) => setForm((current) => ({ ...current, venue: e.target.value }))}
                />
              </Field>

              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={Boolean(phase)}>
                Create live link
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
