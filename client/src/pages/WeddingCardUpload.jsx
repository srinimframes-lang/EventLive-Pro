import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { buildWatchUrl, resolveMediaUrl } from '../utils/format.js';
import ShareButtons from '../components/ShareButtons.jsx';
import YoutubeConnectCard from '../components/YoutubeConnectCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MANUAL_WEDDING_CATEGORIES, isCoupleEventType } from '../utils/weddingTemplates.js';

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

const EMPTY_MANUAL = {
  category: 'wedding',
  brideName: '',
  groomName: '',
  eventTitle: '',
  weddingDate: '',
  weddingTime: '',
  venue: '',
  additionalDetails: '',
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

function brideWedsTitle(groom, bride) {
  const g = String(groom || '').trim();
  const b = String(bride || '').trim();
  return g && b ? `${b} Weds ${g}` : '';
}

function coupleAmpersandTitle(groom, bride) {
  const g = String(groom || '').trim();
  const b = String(bride || '').trim();
  return g && b ? `${b} & ${g}` : '';
}

function manualLiveTitle(form) {
  const type = form.category;
  if (type === 'birthday' || type === 'other') return String(form.eventTitle || '').trim();
  if (type === 'wedding') return brideWedsTitle(form.groomName, form.brideName);
  return coupleAmpersandTitle(form.groomName, form.brideName);
}

export default function WeddingCardUpload() {
  const { isAdmin } = useAuth();
  const homePath = isAdmin ? '/admin' : '/dashboard';
  const homeLabel = isAdmin ? 'Admin' : 'Dashboard';
  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const [mode, setMode] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [manual, setManual] = useState(EMPTY_MANUAL);
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
  const manualTitle = useMemo(() => manualLiveTitle(manual), [manual]);

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
      title: payload?.title || event?.title || (mode === 'manual' ? manualTitle : title),
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

  const handleConfirmPayload = (payload) => {
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
  };

  const chooseMode = (next) => {
    setError('');
    setResult(null);
    setExtracted(false);
    setNeedsReview(false);
    setOcrStatus('');
    setPhase('');
    setForm(EMPTY_FORM);
    setManual(EMPTY_MANUAL);
    stopPoll();
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    setMode(next);
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
      handleConfirmPayload(payload);
    } catch (err) {
      setError(err.message || 'Please review the wedding details before creating the live link.');
      setPhase('');
    }
  };

  const confirmManual = async (e) => {
    e.preventDefault();
    if (phase) return;
    setError('');

    if (isCoupleEventType(manual.category)) {
      if (manual.category === 'wedding' && !brideWedsTitle(manual.groomName, manual.brideName)) {
        setError('Please enter the bride and groom names.');
        return;
      }
      if (manual.category !== 'wedding' && !coupleAmpersandTitle(manual.groomName, manual.brideName)) {
        setError('Please enter the couple names.');
        return;
      }
    } else if (!String(manual.eventTitle || '').trim()) {
      setError(manual.category === 'birthday' ? 'Please enter the name.' : 'Please enter the event title.');
      return;
    }
    if (!manual.weddingDate) {
      setError('Please enter the wedding date.');
      return;
    }
    if (!manual.weddingTime) {
      setError('Please enter the wedding time.');
      return;
    }
    if (!manual.venue.trim()) {
      setError('Please enter the venue.');
      return;
    }

    setPhase('youtube');
    try {
      const payload = await eventService.confirmWeddingCard({
        entryMode: 'manual',
        category: manual.category,
        brideName: manual.brideName.trim(),
        groomName: manual.groomName.trim(),
        eventTitle: manual.eventTitle.trim(),
        weddingDate: manual.weddingDate,
        weddingTime: manual.weddingTime,
        venue: manual.venue.trim(),
        additionalDetails: manual.additionalDetails.trim(),
      });
      handleConfirmPayload(payload);
    } catch (err) {
      setError(err.message || 'Please enter the wedding details before creating the live link.');
      setPhase('');
    }
  };

  const liveUrl = result?.liveUrl || '';
  const savedEvent = result?.event;
  const progressPhases = mode === 'manual' ? PHASES.filter((item) => item.id !== 'upload' && item.id !== 'read' && item.id !== 'prepare') : PHASES;
  const phaseIndex = progressPhases.findIndex((item) => item.id === phase);
  const showProgress = Boolean(phase) && phase !== 'ready';
  const showChoice = !mode && phase !== 'ready';
  const showUpload = mode === 'upload' && phase !== 'ready';
  const showManual = mode === 'manual' && phase !== 'ready';

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm text-slate-500">
        <Link to={homePath} className="text-brand-600 hover:underline">
          ← {homeLabel}
        </Link>
      </p>

      {showChoice ? (
        <>
          <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Wedding live page</h1>
          <p className="mt-1 text-slate-600">
            Create your EventLivePro live link from an invitation photo, or enter the details
            yourself.
          </p>
          <div className="mt-8 grid gap-4">
            <button
              type="button"
              className="card w-full border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-5 text-left shadow-sm transition hover:border-rose-300"
              onClick={() => chooseMode('upload')}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700">Option 1</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">
                Upload Wedding Card
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Upload an invitation photo. We read the names and date, then create the live page.
              </p>
            </button>
            <button
              type="button"
              className="card w-full border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-5 text-left shadow-sm transition hover:border-amber-300"
              onClick={() => chooseMode('manual')}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">Option 2</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">
                Enter Details Manually
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Create the wedding live page without uploading a card.
              </p>
            </button>
          </div>
        </>
      ) : (
        <>
          {mode && phase !== 'ready' ? (
            <button
              type="button"
              className="mt-1 text-sm text-brand-600 hover:underline"
              onClick={() => chooseMode('')}
            >
              ← Choose another option
            </button>
          ) : null}
          {showUpload || (mode === 'upload' && phase === 'ready') ? (
            <>
              <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">
                Upload wedding card
              </h1>
              <p className="mt-1 text-slate-600">
                Upload an invitation photo. We read the names and date, then create your
                EventLivePro live link using your connected YouTube account.
              </p>
            </>
          ) : null}
          {showManual || (mode === 'manual' && phase === 'ready') ? (
            <>
              <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">
                Enter details manually
              </h1>
              <p className="mt-1 text-slate-600">
                Add the couple details to create your EventLivePro live page. No invitation photo is
                required.
              </p>
            </>
          ) : null}
        </>
      )}

      {showProgress && (
        <div className="card mt-6">
          <p className="text-sm font-semibold text-slate-900">
            {progressPhases[phaseIndex]?.label || 'Working…'}
          </p>
          <ol className="mt-3 space-y-1 text-sm text-slate-600">
            {progressPhases.map((item, index) => (
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
            <Link to={homePath} className="btn-primary">
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

      {showUpload && (
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

      {showManual && (
        <>
          <div className="mt-8">
            <YoutubeConnectCard returnTo="/wedding-card" />
          </div>

          <form onSubmit={confirmManual} className="card mt-6 space-y-5">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <Field label="Type" htmlFor="manualEventType">
              <select
                id="manualEventType"
                name="category"
                className="input"
                value={manual.category}
                onChange={(e) => setManual((current) => ({ ...current, category: e.target.value }))}
              >
                {MANUAL_WEDDING_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Live title">
              <input
                className="input bg-slate-50"
                readOnly
                value={
                  manualTitle
                  || (isCoupleEventType(manual.category)
                    ? 'Enter bride and groom names'
                    : manual.category === 'birthday'
                      ? 'Enter the name'
                      : 'Enter the event title')
                }
              />
            </Field>

            {isCoupleEventType(manual.category) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Groom Name" htmlFor="manualGroomName" required>
                  <input
                    id="manualGroomName"
                    name="groomName"
                    className="input"
                    maxLength={80}
                    required
                    placeholder="Srinivas"
                    value={manual.groomName}
                    onChange={(e) => setManual((current) => ({ ...current, groomName: e.target.value }))}
                  />
                </Field>
                <Field label="Bride Name" htmlFor="manualBrideName" required>
                  <input
                    id="manualBrideName"
                    name="brideName"
                    className="input"
                    maxLength={80}
                    required
                    placeholder="Mounika"
                    value={manual.brideName}
                    onChange={(e) => setManual((current) => ({ ...current, brideName: e.target.value }))}
                  />
                </Field>
              </div>
            ) : (
              <Field
                label={manual.category === 'birthday' ? 'Name' : 'Event Title'}
                htmlFor="manualEventTitle"
                required
              >
                <input
                  id="manualEventTitle"
                  name="eventTitle"
                  className="input"
                  maxLength={120}
                  required
                  placeholder={manual.category === 'birthday' ? 'Mounika' : 'Family Celebration'}
                  value={manual.eventTitle}
                  onChange={(e) => setManual((current) => ({ ...current, eventTitle: e.target.value }))}
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={manual.category === 'wedding' ? 'Wedding Date' : 'Date'}
                htmlFor="manualWeddingDate"
                required
              >
                <input
                  id="manualWeddingDate"
                  name="weddingDate"
                  type="date"
                  className="input"
                  required
                  value={manual.weddingDate}
                  onChange={(e) => setManual((current) => ({ ...current, weddingDate: e.target.value }))}
                />
              </Field>
              <Field
                label={manual.category === 'wedding' ? 'Wedding Time' : 'Time'}
                htmlFor="manualWeddingTime"
                required
              >
                <input
                  id="manualWeddingTime"
                  name="weddingTime"
                  type="time"
                  className="input"
                  required
                  value={manual.weddingTime}
                  onChange={(e) => setManual((current) => ({ ...current, weddingTime: e.target.value }))}
                />
              </Field>
            </div>

            <Field label="Venue" htmlFor="manualVenue" required>
              <input
                id="manualVenue"
                name="venue"
                className="input"
                maxLength={200}
                required
                placeholder="Hyderabad"
                value={manual.venue}
                onChange={(e) => setManual((current) => ({ ...current, venue: e.target.value }))}
              />
            </Field>

            <Field label="Additional Details" htmlFor="manualAdditionalDetails">
              <textarea
                id="manualAdditionalDetails"
                name="additionalDetails"
                className="input min-h-[6rem] resize-y"
                maxLength={5000}
                placeholder="Optional notes for your live page"
                value={manual.additionalDetails}
                onChange={(e) =>
                  setManual((current) => ({ ...current, additionalDetails: e.target.value }))
                }
              />
            </Field>

            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={Boolean(phase)}>
              Create live link
            </button>
          </form>
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
