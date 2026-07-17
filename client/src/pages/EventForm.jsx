import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  eventService,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from '../services/event.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { toDateTimeLocal, extractYouTubeId, resolveMediaUrl } from '../utils/format.js';
import { normalizeStudioForm } from '../utils/studioFields.js';
import { themeService } from '../services/theme.service.js';
import ThemeGallery from '../components/theme/ThemeGallery.jsx';
import EventQrCard from '../components/EventQrCard.jsx';
import ToastBanner from '../components/ToastBanner.jsx';
import { useToast } from '../hooks/useToast.js';
import { streamService } from '../services/stream.service.js';

const LINK_COSTS = { youtube: 1, server: 5 };

const EMPTY = {
  title: '',
  description: '',
  category: 'webinar',
  status: 'draft',
  startTime: '',
  endTime: '',
  isOnline: true,
  location: 'Online',
  venue: '',
  youtubeUrl: '',
  hlsUrl: '',
  chatEnabled: true,
  capacity: 0,
  tags: '',
  brideName: '',
  groomName: '',
  studioName: '',
  photographerName: '',
  photographerLogo: '',
  studioPhone: '',
  studioWhatsapp: '',
  studioEmail: '',
  studioWebsite: '',
  studioInstagram: '',
  studioFacebook: '',
  studioYoutube: '',
  studioMapsUrl: '',
  coverImage: '',
  theme: '',
  shortCode: '',
  slug: '',
  qrCodeImage: '',
  qrCodeTargetUrl: '',
  brandDomain: '',
};

export default function EventForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin, refreshUser } = useAuth();
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const pendingCoverRef = useRef(null);
  const pendingLogoRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const { toast, showToast, clearToast } = useToast();

  // Stream type: YouTube Live (1 credit) or Premium Server Live (5 credits).
  const [streamType, setStreamType] = useState(
    searchParams.get('type') === 'server' ? 'server' : 'youtube'
  );
  const balance = user?.creditBalance ?? 0;
  const cost = LINK_COSTS[streamType] || 1;
  const showCreditCosts = !isAdmin && !isEdit;
  const insufficient = showCreditCosts && balance < cost;

  const [serverStream, setServerStream] = useState(null);
  const [serverStreamLoading, setServerStreamLoading] = useState(false);

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState('');
  const [allThemes, setAllThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);

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
          venue: event.venue || '',
          youtubeUrl: event.youtubeVideoId
            ? `https://youtu.be/${event.youtubeVideoId}`
            : event.streamUrl || '',
          hlsUrl: event.hlsUrl || '',
          rtmpPublishUrl: event.rtmpPublishUrl || '',
          chatEnabled: event.chatEnabled ?? true,
          capacity: event.capacity || 0,
          tags: (event.tags || []).join(', '),
          brideName: event.brideName || '',
          groomName: event.groomName || '',
          studioName: event.studioName || '',
          photographerName: event.photographerName || '',
          photographerLogo: event.photographerLogo || '',
          studioPhone: event.studioPhone || '',
          studioWhatsapp: event.studioWhatsapp || '',
          studioEmail: event.studioEmail || '',
          studioWebsite: event.studioWebsite || '',
          studioInstagram: event.studioInstagram || '',
          studioFacebook: event.studioFacebook || '',
          studioYoutube: event.studioYoutube || '',
          studioMapsUrl: event.studioMapsUrl || '',
          coverImage: event.coverImage || '',
          theme: event.theme?.id || event.theme || '',
          shortCode: event.shortCode || '',
          slug: event.slug || '',
          qrCodeImage: event.qrCodeImage || '',
          qrCodeTargetUrl: event.qrCodeTargetUrl || '',
          brandDomain: event.brandDomain || '',
        });
        const provider = event.streamProvider || '';
        const credit = event.creditType || '';
        if (
          provider === 'rtmp' ||
          provider === 'hls' ||
          credit === 'server'
        ) {
          setStreamType('server');
        } else {
          setStreamType('youtube');
        }
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  useEffect(() => {
    if (!isEdit || !id || streamType !== 'server' || !form.isOnline) {
      setServerStream(null);
      return undefined;
    }
    let active = true;
    setServerStreamLoading(true);
    Promise.all([
      streamService.getKey(id).catch(() => null),
      streamService.getConfig(id).catch(() => null),
    ])
      .then(([keyInfo, cfg]) => {
        if (!active || !keyInfo) return;
        setServerStream({
          rtmpUrl: keyInfo.ingestUrl || '',
          streamKey: keyInfo.streamKey || '',
          hlsPlayerUrl: keyInfo.playbackUrl || cfg?.playbackUrl || cfg?.hlsUrl || '',
        });
      })
      .finally(() => active && setServerStreamLoading(false));
    return () => {
      active = false;
    };
  }, [isEdit, id, streamType, form.isOnline]);

  useEffect(() => {
    let active = true;
    setThemesLoading(true);
    themeService
      .list()
      .then((list) => {
        const sorted = (list || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        active && setAllThemes(sorted);
      })
      .catch(() => active && setAllThemes([]))
      .finally(() => active && setThemesLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isEdit) {
      pendingLogoRef.current = file;
      setForm((f) => ({ ...f, photographerLogo: URL.createObjectURL(file) }));
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

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isEdit) {
      pendingCoverRef.current = file;
      setForm((f) => ({ ...f, coverImage: URL.createObjectURL(file) }));
      return;
    }
    setUploadingCover(true);
    setError('');
    try {
      const { coverImage } = await eventService.uploadCover(id, file);
      setForm((f) => ({ ...f, coverImage }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleQrUpdated = useCallback((data) => {
    setForm((f) => ({
      ...f,
      qrCodeImage: data.qrCodeImage,
      qrCodeTargetUrl: data.qrCodeTargetUrl,
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saveInFlightRef.current || submitting || uploadingLogo || uploadingCover) return;

    setError('');
    const studioForm = normalizeStudioForm(form);
    saveInFlightRef.current = true;
    setSubmitting(true);

    if (form.isOnline && !streamType) {
      setError('Please select a stream type.');
      saveInFlightRef.current = false;
      setSubmitting(false);
      return;
    }

    const youtubeVideoId =
      form.isOnline && streamType === 'youtube' ? extractYouTubeId(form.youtubeUrl) : '';

    if (form.isOnline && streamType === 'youtube' && !youtubeVideoId) {
      setError('A valid YouTube Live URL is required for YouTube Live events.');
      saveInFlightRef.current = false;
      setSubmitting(false);
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      status: form.status,
      isOnline: form.isOnline,
      location: form.isOnline ? 'Online' : form.location,
      venue: form.venue?.trim() || '',
      capacity: Number(form.capacity) || 0,
      startTime: form.startTime ? new Date(form.startTime).toISOString() : undefined,
      endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
      brideName: form.brideName?.trim() || '',
      groomName: form.groomName?.trim() || '',
      chatEnabled: form.chatEnabled,
    };

    if (form.isOnline) {
      payload.streamType = streamType;
      payload.linkType = streamType;
      if (streamType === 'youtube') {
        payload.streamUrl = form.youtubeUrl?.trim() || '';
        payload.youtubeVideoId = youtubeVideoId;
        payload.streamProvider = 'youtube';
      } else {
        payload.streamProvider = 'rtmp';
        payload.youtubeVideoId = '';
        payload.streamUrl = '';
        if (form.hlsUrl?.trim()) payload.hlsUrl = form.hlsUrl.trim();
      }
    }

    if (form.tags?.trim()) {
      payload.tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const studioKeys = [
      'studioName',
      'photographerName',
      'studioPhone',
      'studioWhatsapp',
      'studioEmail',
      'studioWebsite',
      'studioInstagram',
      'studioFacebook',
      'studioYoutube',
      'studioMapsUrl',
    ];
    for (const key of studioKeys) {
      if (studioForm[key]) payload[key] = studioForm[key];
    }

    if (form.theme) payload.theme = form.theme;

    const pendingCover = pendingCoverRef.current;
    const pendingLogo = pendingLogoRef.current;
    pendingCoverRef.current = null;
    pendingLogoRef.current = null;

    let saved = null;
    try {
      saved = isEdit
        ? await eventService.update(id, payload)
        : await eventService.create(payload);

      if (saved) {
        setForm((f) => ({
          ...f,
          shortCode: saved.shortCode || f.shortCode,
          slug: saved.slug || f.slug,
          qrCodeImage: saved.qrCodeImage || f.qrCodeImage,
          qrCodeTargetUrl: saved.qrCodeTargetUrl || f.qrCodeTargetUrl,
        }));
      }

      if (!isEdit && saved?.id) {
        const uploads = [];
        if (pendingCover) uploads.push(eventService.uploadCover(saved.id, pendingCover));
        if (pendingLogo) uploads.push(eventService.uploadLogo(saved.id, pendingLogo));
        if (uploads.length) await Promise.all(uploads);
        if (streamType === 'server') {
          try {
            const keyInfo = await streamService.getKey(saved.id);
            setServerStream({
              rtmpUrl: keyInfo.ingestUrl || '',
              streamKey: keyInfo.streamKey || '',
              hlsPlayerUrl: keyInfo.playbackUrl || '',
            });
          } catch {
            /* credentials available on edit page */
          }
        }
      }

      if (!isAdmin) await refreshUser().catch(() => {});
    } catch (err) {
      pendingCoverRef.current = pendingCover;
      pendingLogoRef.current = pendingLogo;
      const message = err.message || 'Failed to save event. Please try again.';
      // eslint-disable-next-line no-console
      console.error('[EventForm] save failed:', {
        isEdit,
        status: err.status,
        code: err.code,
        message: err.message,
        response: err.response?.data,
      });
      setError(message);
      showToast(message);
      return;
    } finally {
      saveInFlightRef.current = false;
      setSubmitting(false);
    }

    if (saved) {
      navigate(isEdit ? `/events/${saved.slug || saved.id}` : `/events/${saved.id}/edit`, {
        replace: true,
      });
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

      {isEdit && id && (
        <div className="mt-6">
          <EventQrCard
            event={{
              id,
              title: form.title,
              brideName: form.brideName,
              groomName: form.groomName,
              shortCode: form.shortCode,
              slug: form.slug,
              brandDomain: form.brandDomain,
              qrCodeImage: form.qrCodeImage,
              qrCodeTargetUrl: form.qrCodeTargetUrl,
            }}
            suspendAutoSync={submitting}
            onQrUpdated={handleQrUpdated}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            {/credit/i.test(error) && (
              <>
                {' '}
                <Link to="/dashboard#buy-credits" className="font-semibold underline">
                  Buy credits
                </Link>
              </>
            )}
          </div>
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

        {/* ── Professional theme ─────────────────────────────── */}
        <Section
          title="Choose a theme"
          subtitle="10 premium layout themes — optional; pick one for a custom live page design."
        >
          <ThemeGallery
            themes={allThemes}
            selectedId={form.theme}
            onSelect={(tid) => setForm((f) => ({ ...f, theme: tid }))}
            loading={themesLoading}
          />
          {form.theme && (
            <p className="mt-3 text-xs text-emerald-700">Theme selected — it will appear on your live watch page.</p>
          )}
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

          <Field label="Venue" htmlFor="venue" hint="The ceremony venue, shown on the watch page.">
            <input id="venue" name="venue" className="input" maxLength={200}
              placeholder="e.g. The Leela Palace, Udaipur" value={form.venue} onChange={handleChange} />
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Couple photo</span>
            <div className="flex flex-wrap items-center gap-4">
              {form.coverImage ? (
                <img
                  src={resolveMediaUrl(form.coverImage)}
                  alt="Couple"
                  className="h-20 w-28 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="grid h-20 w-28 place-items-center rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                  No photo
                </div>
              )}
              <div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                  disabled={uploadingCover}
                />
                <p className="mt-1 text-xs text-slate-400">
                  {uploadingCover
                    ? 'Uploading…'
                    : isEdit
                      ? 'A hero photo of the couple. JPG/PNG, up to 8 MB.'
                      : 'Select a photo — it will upload when you create the event.'}
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Streaming ──────────────────────────────────────── */}
        <Section title="Live stream">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="isOnline" checked={form.isOnline} onChange={handleChange} />
            This is an online event (live streamed)
          </label>

          {form.isOnline ? (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Stream type <span className="text-red-500">*</span>
                </p>
                {showCreditCosts && (
                  <p className="mb-3 text-xs text-slate-500">
                    Your balance: {balance} credit{balance === 1 ? '' : 's'}. Credits are deducted
                    when the event is created.
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${
                      streamType === 'youtube' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
                    }`}
                  >
                    <span>
                      <input
                        type="radio"
                        name="streamType"
                        className="mr-2"
                        checked={streamType === 'youtube'}
                        onChange={() => setStreamType('youtube')}
                        required
                      />
                      YouTube Live
                    </span>
                    {showCreditCosts && (
                      <span className="text-sm font-semibold text-slate-600">1 credit</span>
                    )}
                  </label>
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${
                      streamType === 'server' ? 'border-gold-500 bg-gold-50' : 'border-slate-200'
                    }`}
                  >
                    <span>
                      <input
                        type="radio"
                        name="streamType"
                        className="mr-2"
                        checked={streamType === 'server'}
                        onChange={() => setStreamType('server')}
                        required
                      />
                      Premium Server Live
                    </span>
                    {showCreditCosts && (
                      <span className="text-sm font-semibold text-slate-600">5 credits</span>
                    )}
                  </label>
                </div>
                {insufficient && (
                  <p className="mt-2 text-sm text-amber-700">
                    You need {cost - balance} more credit{cost - balance === 1 ? '' : 's'} for{' '}
                    {streamType === 'server' ? 'Premium Server Live' : 'YouTube Live'}.{' '}
                    <Link to="/dashboard#buy-credits" className="font-semibold underline">
                      Buy credits
                    </Link>
                    .
                  </p>
                )}
              </div>

              {streamType === 'youtube' ? (
                <Field
                  label="YouTube Live URL"
                  htmlFor="youtubeUrl"
                  hint="Paste the YouTube Live URL or video ID. It will be embedded on the watch page."
                >
                  <input
                    id="youtubeUrl"
                    name="youtubeUrl"
                    type="text"
                    required
                    placeholder="https://youtube.com/live/…  or  https://youtu.be/…"
                    className="input"
                    value={form.youtubeUrl}
                    onChange={handleChange}
                  />
                  {form.youtubeUrl && (
                    <p className="mt-1 text-xs text-slate-400">
                      {extractYouTubeId(form.youtubeUrl)
                        ? `Detected video ID: ${extractYouTubeId(form.youtubeUrl)}`
                        : 'Could not detect a YouTube video ID yet.'}
                    </p>
                  )}
                </Field>
              ) : (
                <div className="space-y-4 rounded-xl border border-gold-200 bg-gold-50/50 p-4">
                  <p className="text-sm text-slate-600">
                    Stream to our premium RTMP server. Use these credentials in OBS or your encoder.
                  </p>
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    OBS Settings → Output → Streaming: Keyframe Interval = <strong>2</strong> (seconds),
                    Rate Control CBR, bitrate 1500–2500 kbps for 720p. Put only the Stream Key in OBS —
                    do not paste the full RTMP URL into the key field.
                  </p>
                  {isEdit && serverStreamLoading && (
                    <p className="text-sm text-slate-500">Loading stream credentials…</p>
                  )}
                  {isEdit && serverStream && !serverStreamLoading && (
                    <>
                      <Field label="OBS Server URL" htmlFor="rtmpUrl">
                        <input
                          id="rtmpUrl"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.rtmpUrl}
                        />
                      </Field>
                      <Field label="Stream Key" htmlFor="streamKey">
                        <input
                          id="streamKey"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.streamKey}
                        />
                      </Field>
                      <Field
                        label="HLS Playback URL"
                        htmlFor="hlsPlayerUrl"
                        hint="Used on the public watch page for MediaMTX playback."
                      >
                        <input
                          id="hlsPlayerUrl"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.hlsPlayerUrl}
                        />
                      </Field>
                    </>
                  )}
                  {!isEdit && serverStream && (
                    <>
                      <Field label="OBS Server URL" htmlFor="rtmpUrlNew">
                        <input
                          id="rtmpUrlNew"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.rtmpUrl}
                        />
                      </Field>
                      <Field label="Stream Key" htmlFor="streamKeyNew">
                        <input
                          id="streamKeyNew"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.streamKey}
                        />
                      </Field>
                      <Field label="HLS Playback URL" htmlFor="hlsPlayerUrlNew">
                        <input
                          id="hlsPlayerUrlNew"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.hlsPlayerUrl}
                        />
                      </Field>
                    </>
                  )}
                  {!isEdit && !serverStream && (
                    <p className="text-sm text-slate-500">
                      RTMP URL, stream key, and HLS player URL will be generated when you save this
                      event.
                    </p>
                  )}
                  <Field
                    label="Custom HLS URL (optional)"
                    htmlFor="hlsUrl"
                    hint="Override the default HLS playback URL if needed."
                  >
                    <input
                      id="hlsUrl"
                      name="hlsUrl"
                      type="text"
                      placeholder="https://…/master.m3u8"
                      className="input font-mono text-xs"
                      value={form.hlsUrl}
                      onChange={handleChange}
                    />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <Field label="Venue / location" htmlFor="location">
              <input id="location" name="location" className="input"
                value={form.location} onChange={handleChange} />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="chatEnabled" checked={form.chatEnabled} onChange={handleChange} />
            Enable live chat on the watch page
          </label>
        </Section>

        {/* ── Photography branding ───────────────────────────── */}
        <Section
          title="Photography studio"
          subtitle="Optional. Shown on the public watch page as “Captured by”. All contact and social fields are optional."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Studio name" htmlFor="studioName">
              <input
                id="studioName"
                name="studioName"
                className="input"
                maxLength={120}
                placeholder="e.g. Moments Studio"
                value={form.studioName}
                onChange={handleChange}
              />
            </Field>
            <Field label="Photographer name" htmlFor="photographerName">
              <input
                id="photographerName"
                name="photographerName"
                className="input"
                maxLength={120}
                placeholder="e.g. Rahul Sharma"
                value={form.photographerName}
                onChange={handleChange}
              />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Studio logo</span>
            <div className="flex flex-wrap items-center gap-4">
              {form.photographerLogo ? (
                <img
                  src={resolveMediaUrl(form.photographerLogo)}
                  alt="Studio logo"
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
                  {uploadingLogo
                    ? 'Uploading…'
                    : isEdit
                      ? 'PNG/JPG/SVG, up to 8 MB.'
                      : 'Select a logo — it will upload when you create the event.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number (optional)" htmlFor="studioPhone">
              <input
                id="studioPhone"
                name="studioPhone"
                type="tel"
                className="input"
                maxLength={30}
                placeholder="+91 98765 43210"
                value={form.studioPhone}
                onChange={handleChange}
              />
            </Field>
            <Field label="WhatsApp number (optional)" htmlFor="studioWhatsapp">
              <input
                id="studioWhatsapp"
                name="studioWhatsapp"
                type="tel"
                className="input"
                maxLength={30}
                placeholder="+91 98765 43210"
                value={form.studioWhatsapp}
                onChange={handleChange}
              />
            </Field>
          </div>

          <Field label="Email (optional)" htmlFor="studioEmail">
            <input
              id="studioEmail"
              name="studioEmail"
              type="text"
              inputMode="email"
              autoComplete="email"
              className="input"
              maxLength={120}
              placeholder="hello@studio.com"
              value={form.studioEmail}
              onChange={handleChange}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website URL (optional)" htmlFor="studioWebsite" hint="Full URL or domain, e.g. momentsstudio.com">
              <input
                id="studioWebsite"
                name="studioWebsite"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://momentsstudio.com"
                value={form.studioWebsite}
                onChange={handleChange}
              />
            </Field>
            <Field label="Google Maps URL (optional)" htmlFor="studioMapsUrl">
              <input
                id="studioMapsUrl"
                name="studioMapsUrl"
                type="text"
                className="input"
                maxLength={500}
                placeholder="https://maps.google.com/…"
                value={form.studioMapsUrl}
                onChange={handleChange}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Instagram URL (optional)" htmlFor="studioInstagram">
              <input
                id="studioInstagram"
                name="studioInstagram"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://instagram.com/…"
                value={form.studioInstagram}
                onChange={handleChange}
              />
            </Field>
            <Field label="Facebook URL (optional)" htmlFor="studioFacebook">
              <input
                id="studioFacebook"
                name="studioFacebook"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://facebook.com/…"
                value={form.studioFacebook}
                onChange={handleChange}
              />
            </Field>
            <Field label="YouTube URL (optional)" htmlFor="studioYoutube">
              <input
                id="studioYoutube"
                name="studioYoutube"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://youtube.com/@…"
                value={form.studioYoutube}
                onChange={handleChange}
              />
            </Field>
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
          <button
            type="submit"
            className="btn-primary w-full sm:w-auto"
            disabled={submitting || uploadingLogo || uploadingCover || insufficient}
          >
            {submitting
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : showCreditCosts
                  ? `Create link (${cost} credit${cost > 1 ? 's' : ''})`
                  : 'Create event'}
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
      <ToastBanner toast={toast} onClose={clearToast} />
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
