import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { eventService } from '../services/event.service.js';
import { tenantService } from '../services/tenant.service.js';
import BuyCreditsPanel from '../components/BuyCreditsPanel.jsx';
import WhiteLabelPanel from '../components/WhiteLabelPanel.jsx';
import ShareButtons from '../components/ShareButtons.jsx';
import YoutubeConnectCard from '../components/YoutubeConnectCard.jsx';
import { formatDateTime, watchPath, buildWatchUrl, resolveMediaUrl } from '../utils/format.js';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [linkOrigin, setLinkOrigin] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    eventService
      .list({ mine: true, limit: 50 })
      .then((res) => setEvents(res.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshUser();
    load();
    tenantService
      .myDomains()
      .then((d) => setLinkOrigin(d.activeHost ? `https://${d.activeHost}` : ''))
      .catch(() => {});
  }, [refreshUser, load]);

  const liveLink = (ev) => buildWatchUrl(ev, linkOrigin);
  const weddingCards = events.filter((ev) => ev.source === 'wedding-card' && !ev.youtubeVideoId);
  const liveLinks = events.filter((ev) => !(ev.source === 'wedding-card' && !ev.youtubeVideoId));
  const copyLink = async (ev) => {
    try {
      await navigator.clipboard.writeText(liveLink(ev));
      setCopiedId(ev.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt('Copy this live link:', liveLink(ev));
    }
  };

  const remove = async (ev) => {
    if (!window.confirm(`Delete live link "${ev.title}"? This cannot be undone.`)) return;
    setBusyId(ev.id);
    setError('');
    try {
      await eventService.remove(ev.id);
      setEvents((list) => list.filter((item) => item.id !== ev.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl font-bold text-slate-900">
        Welcome, {user?.name?.split(' ')[0] || 'there'}
      </h1>
      <p className="mt-1 text-slate-600">
        Start from your wedding invitation, or create a live link manually.
      </p>

      <div className="card mt-6 border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-sm sm:mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700">Wedding live</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">
          📤 Upload Wedding Card
        </h2>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Upload your wedding invitation and automatically create your wedding live page.
        </p>
        <Link
          to="/wedding-card"
          className="btn-primary mt-5 inline-flex w-full justify-center px-5 py-3 text-base sm:w-auto"
        >
          📤 Upload Wedding Card
        </Link>
      </div>

      <div className="card mt-6 bg-gradient-to-br from-brand-50 to-white sm:mt-8">
        <h2 className="text-lg font-bold text-slate-900">Create Live Link</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter event details, paste your YouTube Live URL, upload a thumbnail, and generate a
          unique EventLivePro URL instantly. No payment screenshot or admin approval is required.
        </p>
        <ol className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <li>1. Event title, names, type, date &amp; time</li>
          <li>2. YouTube Live URL + thumbnail</li>
          <li>3. Generate your EventLivePro live link</li>
          <li>4. Copy or share on WhatsApp</li>
        </ol>
        <Link to="/live-links/new" className="btn-outline mt-5 inline-flex w-full justify-center sm:w-auto">
          Create Live Link
        </Link>
      </div>

      {weddingCards.length > 0 && (
        <div className="card mt-8">
          <h2 className="text-lg font-bold text-slate-900">Saved wedding cards</h2>
          <ul className="mt-4 space-y-3">
            {weddingCards.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  {ev.coverImage ? (
                    <img
                      src={resolveMediaUrl(ev.coverImage)}
                      alt=""
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{ev.title}</p>
                    <p className="text-sm text-slate-500">
                      {ev.groomName || ev.brideName
                        ? `${ev.groomName || ''}${ev.groomName && ev.brideName ? ' & ' : ''}${ev.brideName || ''} · `
                        : ''}
                      {ev.startTime ? formatDateTime(ev.startTime) : ''}
                    </p>
                    {ev.venue ? <p className="text-sm text-slate-500">{ev.venue}</p> : null}
                  </div>
                  <span className="badge bg-slate-100 text-slate-600">
                    {ev.youtubeProvisionStatus === 'pending' || ev.youtubeProvisionStatus === 'failed'
                      ? 'Generating live link'
                      : 'Details saved'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8">
        <YoutubeConnectCard returnTo="/dashboard" />
      </div>

      <div className="card mt-8">
        <h2 className="text-lg font-bold text-slate-900">My live links</h2>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="mt-4 text-slate-500">Loading…</p>
        ) : liveLinks.length === 0 ? (
          <p className="mt-4 text-slate-600">No live links yet. Create one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {liveLinks.map((ev) => {
              const url = liveLink(ev);
              const shareTitle =
                ev.groomName && ev.brideName
                  ? `${ev.groomName} & ${ev.brideName}`
                  : ev.title;
              return (
                <li key={ev.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{ev.title}</p>
                      <p className="text-sm text-slate-500">
                        {ev.groomName || ev.brideName
                          ? `${ev.groomName || ''}${ev.groomName && ev.brideName ? ' & ' : ''}${ev.brideName || ''} · `
                          : ''}
                        {ev.startTime ? formatDateTime(ev.startTime) : ''}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-400">{url}</p>
                    </div>
                    <span
                      className={`badge ${
                        ev.streamDisabled
                          ? 'bg-amber-100 text-amber-800'
                          : ev.isLive
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {ev.streamDisabled ? 'Disabled' : ev.isLive ? 'LIVE' : ev.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn-outline" onClick={() => copyLink(ev)}>
                      {copiedId === ev.id ? 'Copied!' : 'Copy link'}
                    </button>
                    <ShareButtons url={url} title={shareTitle} />
                    <Link to={`/live-links/${ev.id}/edit`} className="btn-outline">
                      Edit
                    </Link>
                    <Link to={watchPath(ev)} className="btn-primary">
                      Watch
                    </Link>
                    <button
                      type="button"
                      className="btn-outline text-red-600"
                      disabled={busyId === ev.id}
                      onClick={() => remove(ev)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div id="buy-credits" className="mt-8 scroll-mt-20">
        <BuyCreditsPanel optional />
      </div>

      <WhiteLabelPanel initialBranding={user?.branding} />

      <div className="card mt-8">
        <h2 className="text-lg font-bold text-slate-900">Your account</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="Name" value={user?.name} />
          <Info label="Email" value={user?.email} />
        </dl>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
