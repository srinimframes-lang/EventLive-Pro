import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { streamService, STREAM_PROVIDERS } from '../services/stream.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLiveRoom } from '../hooks/useLiveRoom.js';
import { extractYouTubeId } from '../utils/format.js';
import LivePlayer from '../components/live/LivePlayer.jsx';
import LiveChat from '../components/live/LiveChat.jsx';
import QAPanel from '../components/live/QAPanel.jsx';
import ViewerCount from '../components/live/ViewerCount.jsx';
import PhotoGallery from '../components/PhotoGallery.jsx';

export default function Studio() {
  const { id } = useParams();
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [keyInfo, setKeyInfo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ streamProvider: 'none', youtubeVideoId: '', hlsUrl: '', webrtcUrl: '', autoRecord: false });

  const [gallery, setGallery] = useState([]);
  const [uploading, setUploading] = useState(false);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    eventService
      .get(id)
      .then(async (ev) => {
        if (!active) return;
        setEvent(ev);
        setGallery(ev.gallery || []);
        const cfg = await streamService.getConfig(ev.id);
        if (!active) return;
        setConfig(cfg);
        setForm({
          streamProvider: cfg.provider || 'none',
          youtubeVideoId: cfg.youtubeVideoId || '',
          hlsUrl: cfg.hlsUrl || '',
          webrtcUrl: cfg.webrtcUrl || '',
          autoRecord: Boolean(cfg.autoRecord),
        });
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [id]);

  const eventId = event?.id;
  const room = useLiveRoom(eventId, { guestName: user?.name });

  const canManage = useMemo(() => {
    if (!event || !user) return false;
    const organizerId = event.organizer?.id || event.organizer?._id;
    return user.role === 'admin' || organizerId === user.id;
  }, [event, user]);

  const coupleTitle = useMemo(() => {
    if (!event) return '';
    if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
    return event.brideName || event.groomName || '';
  }, [event]);

  const isLive = room.liveStatus ? room.liveStatus.isLive : config?.isLive;

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const saveConfig = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        // Accept a full YouTube URL in the video-id field and normalise it.
        youtubeVideoId:
          form.streamProvider === 'youtube'
            ? extractYouTubeId(form.youtubeVideoId)
            : form.youtubeVideoId,
      };
      const updated = await streamService.updateConfig(eventId, payload);
      setConfig(updated);
      setForm((f) => ({ ...f, youtubeVideoId: updated.youtubeVideoId || '' }));
      flash('Stream settings saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleLive = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await streamService.setLive(eventId, !isLive);
      setConfig(updated);
      flash(updated.isLive ? 'You are live!' : 'Stream ended');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleDisabled = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await streamService.setDisabled(eventId, !config?.streamDisabled);
      setConfig(updated);
      flash(updated.streamDisabled ? 'Stream disabled' : 'Stream enabled');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const restartStream = async () => {
    setError('');
    try {
      await streamService.restart(eventId);
      flash('Players asked to reconnect');
    } catch (err) {
      setError(err.message);
    }
  };

  const revealKey = async () => {
    setError('');
    try {
      setKeyInfo(await streamService.getKey(eventId));
    } catch (err) {
      setError(err.message);
    }
  };

  const regenerateKey = async () => {
    if (!window.confirm('Regenerate the stream key? Existing encoders will stop working.')) return;
    setError('');
    try {
      setKeyInfo(await streamService.regenerateKey(eventId));
      flash('Stream key regenerated');
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => flash('Copied to clipboard'));
  };

  const handleGalleryUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const updated = await eventService.uploadGallery(eventId, files);
      setGallery(updated);
      flash(`${files.length} photo(s) uploaded`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Remove this photo?')) return;
    try {
      const updated = await eventService.deleteGalleryPhoto(eventId, photoId);
      setGallery(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !event)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        <Link to="/events" className="btn-ghost mt-4">Back to events</Link>
      </div>
    );

  if (!event) return <p className="py-20 text-center text-slate-500">Loading…</p>;

  if (!canManage)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
          You don&apos;t have permission to manage this event&apos;s stream.
        </p>
        <Link to={`/events/${event.slug || event.id}`} className="btn-ghost mt-4">
          View event
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/events/${event.slug || event.id}`} className="text-sm text-brand-600 hover:underline">
            ← {event.title}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Streaming studio</h1>
          {coupleTitle && <p className="text-sm font-medium text-brand-700">{coupleTitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewerCount count={room.viewers} isLive={isLive} />
          <Link to={`/events/${event.slug || event.id}/live`} className="btn-ghost">
            Open watch page
          </Link>
          <button
            type="button"
            className={`btn ${isLive ? 'bg-slate-700 text-white hover:bg-slate-800' : 'bg-red-600 text-white hover:bg-red-700'}`}
            onClick={toggleLive}
            disabled={busy}
          >
            {isLive ? 'End stream' : 'Go live'}
          </button>
        </div>
      </div>

      {notice && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        {/* Left: preview + settings */}
        <div className="space-y-6 lg:col-span-2">
          <div>
            <h2 className="mb-2 font-bold text-slate-900">Preview</h2>
            <LivePlayer config={room.liveStatus ? { ...config, isLive } : config} />
          </div>

          <form onSubmit={saveConfig} className="card space-y-4">
            <h2 className="font-bold text-slate-900">Stream source</h2>

            <div>
              <label htmlFor="streamProvider" className="mb-1 block text-sm font-medium text-slate-700">
                Provider
              </label>
              <select
                id="streamProvider"
                name="streamProvider"
                className="input capitalize"
                value={form.streamProvider}
                onChange={handleChange}
              >
                {STREAM_PROVIDERS.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>

            {form.streamProvider === 'youtube' && (
              <Field label="YouTube Live URL or video ID" htmlFor="youtubeVideoId" hint="Paste the full YouTube Live link — it will be embedded on the watch page.">
                <input id="youtubeVideoId" name="youtubeVideoId" className="input"
                  placeholder="https://youtube.com/live/…  or  dQw4w9WgXcQ"
                  value={form.youtubeVideoId} onChange={handleChange} />
                {form.youtubeVideoId && (
                  <p className="mt-1 text-xs text-slate-400">
                    {extractYouTubeId(form.youtubeVideoId)
                      ? `Detected ID: ${extractYouTubeId(form.youtubeVideoId)}`
                      : 'No YouTube ID detected yet.'}
                  </p>
                )}
              </Field>
            )}

            {form.streamProvider === 'rtmp' && (
              <>
                <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                  Private server: stream from OBS to the RTMP details below. Playback
                  is generated automatically — no .m3u8 needed.
                </div>
                {config?.playbackUrl && (
                  <Field label="Playback URL (auto-generated)" htmlFor="playbackUrl">
                    <input id="playbackUrl" className="input bg-slate-50" value={config.playbackUrl} readOnly />
                  </Field>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="autoRecord" checked={form.autoRecord} onChange={handleChange} />
                  Auto-record this stream
                </label>
              </>
            )}

            {form.streamProvider === 'hls' && (
              <Field label="HLS playback URL (.m3u8)" htmlFor="hlsUrl">
                <input id="hlsUrl" name="hlsUrl" type="url" className="input"
                  placeholder="https://…/index.m3u8" value={form.hlsUrl} onChange={handleChange} />
              </Field>
            )}

            {form.streamProvider === 'webrtc' && (
              <Field label="WebRTC (WHEP) URL" htmlFor="webrtcUrl">
                <input id="webrtcUrl" name="webrtcUrl" type="url" className="input"
                  placeholder="https://…/whep" value={form.webrtcUrl} onChange={handleChange} />
              </Field>
            )}

            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </form>

          {/* Photo gallery management */}
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">Photo gallery</h2>
              <span className="text-sm text-slate-500">{gallery.length} photos</span>
            </div>
            <p className="text-sm text-slate-600">
              Upload photos to share with guests on the watch page.
            </p>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryUpload}
              disabled={uploading}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            {uploading && <p className="text-sm text-slate-500">Uploading…</p>}
            <div className="pt-2">
              <PhotoGallery photos={gallery} onDelete={handleDeletePhoto} />
            </div>
          </div>

          {/* RTMP key management */}
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">RTMP ingest</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className={`inline-flex items-center gap-1 font-medium ${isLive ? 'text-red-600' : 'text-slate-400'}`}>
                  <span className={`h-2 w-2 rounded-full ${isLive ? 'animate-pulse bg-red-600' : 'bg-slate-300'}`} />
                  {isLive ? 'Online' : 'Offline'}
                </span>
                <span className="text-slate-500">{room.viewers} watching</span>
                {config?.peakViewers ? <span className="text-slate-400">peak {config.peakViewers}</span> : null}
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Point OBS (or any RTMP encoder) at the server URL and stream key below.
              Output is transcoded to adaptive HLS (240p–720p, capped at 1000&nbsp;kbps).
            </p>

            {config?.streamDisabled && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This stream is disabled — publishing is blocked until you re-enable it.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={toggleDisabled} disabled={busy}>
                {config?.streamDisabled ? 'Enable stream' : 'Disable stream'}
              </button>
              <button type="button" className="btn-ghost" onClick={restartStream} disabled={busy}>
                Restart players
              </button>
            </div>

            {keyInfo ? (
              <div className="space-y-2">
                <KeyRow label="Server URL" value={keyInfo.ingestUrl} onCopy={copy} />
                <KeyRow label="Stream key" value={keyInfo.streamKey} onCopy={copy} secret />
                <div className="flex gap-2 pt-1">
                  <button type="button" className="btn-ghost" onClick={regenerateKey}>
                    Regenerate key
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-primary" onClick={revealKey}>
                Reveal stream key
              </button>
            )}
          </div>
        </div>

        {/* Right: live moderation */}
        <div className="space-y-6 lg:col-span-1">
          <div className="card flex h-[45vh] flex-col p-0">
            <LiveChat messages={room.messages} onSend={room.sendMessage} disabled={!room.connected} />
          </div>
          <div className="card flex h-[45vh] flex-col p-0">
            <QAPanel
              questions={room.questions}
              onAsk={room.askQuestion}
              onUpvote={room.upvoteQuestion}
              onAnswer={room.answerQuestion}
              canAnswer
              disabled={!room.connected}
            />
          </div>
        </div>
      </div>
    </div>
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

function KeyRow({ label, value, onCopy, secret }) {
  const [show, setShow] = useState(!secret);
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-sm text-emerald-300">
          {show ? value : '•'.repeat(Math.min(24, value.length))}
        </code>
        {secret && (
          <button type="button" className="btn-ghost" onClick={() => setShow((s) => !s)}>
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => onCopy(value)}>
          Copy
        </button>
      </div>
    </div>
  );
}
