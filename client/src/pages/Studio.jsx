import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { streamService, STREAM_PROVIDERS } from '../services/stream.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLiveRoom } from '../hooks/useLiveRoom.js';
import LivePlayer from '../components/live/LivePlayer.jsx';
import LiveChat from '../components/live/LiveChat.jsx';
import QAPanel from '../components/live/QAPanel.jsx';
import ViewerCount from '../components/live/ViewerCount.jsx';

export default function Studio() {
  const { id } = useParams();
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [keyInfo, setKeyInfo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ streamProvider: 'none', youtubeVideoId: '', hlsUrl: '', webrtcUrl: '' });

  useEffect(() => {
    let active = true;
    eventService
      .get(id)
      .then(async (ev) => {
        if (!active) return;
        setEvent(ev);
        const cfg = await streamService.getConfig(ev.id);
        if (!active) return;
        setConfig(cfg);
        setForm({
          streamProvider: cfg.provider || 'none',
          youtubeVideoId: cfg.youtubeVideoId || '',
          hlsUrl: cfg.hlsUrl || '',
          webrtcUrl: cfg.webrtcUrl || '',
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

  const isLive = room.liveStatus ? room.liveStatus.isLive : config?.isLive;

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const saveConfig = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await streamService.updateConfig(eventId, form);
      setConfig(updated);
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
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/events/${event.slug || event.id}`} className="text-sm text-brand-600 hover:underline">
            ← {event.title}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Streaming studio</h1>
        </div>
        <div className="flex items-center gap-3">
          <ViewerCount count={room.viewers} isLive={isLive} />
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
              <Field label="YouTube video ID" htmlFor="youtubeVideoId" hint="e.g. dQw4w9WgXcQ">
                <input id="youtubeVideoId" name="youtubeVideoId" className="input"
                  value={form.youtubeVideoId} onChange={handleChange} />
              </Field>
            )}

            {(form.streamProvider === 'hls' || form.streamProvider === 'rtmp') && (
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

          {/* RTMP key management */}
          <div className="card space-y-3">
            <h2 className="font-bold text-slate-900">RTMP ingest</h2>
            <p className="text-sm text-slate-600">
              Point OBS (or any RTMP encoder) at the server URL and stream key below.
            </p>

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
