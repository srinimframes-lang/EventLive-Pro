import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { eventService } from '../services/event.service.js';
import BuyCreditsPanel from '../components/BuyCreditsPanel.jsx';
import { formatDateTime, watchPath } from '../utils/format.js';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const justRegistered = location.state?.justRegistered;
  const pendingApproval = user?.role !== 'admin' && user?.approved === false;
  const balance = user?.creditBalance ?? 0;

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
  }, [refreshUser, load]);

  const liveLink = (ev) => `${window.location.origin}${watchPath(ev)}`;
  const copyLink = async (ev) => {
    try {
      await navigator.clipboard.writeText(liveLink(ev));
      setCopiedId(ev.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt('Copy this live link:', liveLink(ev));
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            Welcome, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="mt-1 text-slate-600">Buy credits and create your live links.</p>
        </div>
      </div>

      {(justRegistered || pendingApproval) && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Account pending approval.</strong> Thanks for registering! Our team will review and
          approve your account shortly.
        </div>
      )}

      {/* Credit balance + create actions */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="card bg-gradient-to-br from-brand-50 to-white lg:col-span-1">
          <p className="text-sm font-medium text-slate-600">Credit balance</p>
          <p className="mt-1 text-5xl font-extrabold text-slate-900">{balance}</p>
          <p className="mt-1 text-xs text-slate-500">1 credit = ₹100 · YouTube link 1 · Server link 5</p>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900">Create a live link</h2>
          <p className="mt-1 text-sm text-slate-500">
            Credits are deducted automatically when you create a link.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CreateCard
              title="YouTube Live Link"
              cost={1}
              balance={balance}
              to="/events/new?type=youtube"
            />
            <CreateCard
              title="Server Live Link"
              cost={5}
              balance={balance}
              to="/events/new?type=server"
            />
          </div>
        </div>
      </div>

      {/* My live links */}
      <div className="card mt-8">
        <h2 className="text-lg font-bold text-slate-900">My live links</h2>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="mt-4 text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="mt-4 text-slate-600">No live links yet. Create one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{ev.title}</p>
                    <p className="text-sm text-slate-500">
                      {ev.creditType && ev.creditType !== 'none'
                        ? `${ev.creditType === 'server' ? 'Server' : 'YouTube'} link · `
                        : ''}
                      {ev.startTime ? formatDateTime(ev.startTime) : ''}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">{liveLink(ev)}</p>
                  </div>
                  <span
                    className={`badge ${ev.isLive ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {ev.isLive ? 'LIVE' : ev.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={() => copyLink(ev)}>
                    {copiedId === ev.id ? 'Copied!' : 'Copy link'}
                  </button>
                  <Link to={`/events/${ev.id}/studio`} className="btn-outline">
                    Studio
                  </Link>
                  <Link to={`/events/${ev.slug || ev.id}/edit`} className="btn-outline">
                    Edit
                  </Link>
                  <Link to={watchPath(ev)} className="btn-primary">
                    Watch
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Buy credits */}
      <div id="buy-credits" className="mt-8 scroll-mt-20">
        <BuyCreditsPanel />
      </div>

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

function CreateCard({ title, cost, balance, to }) {
  const enough = balance >= cost;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="text-sm text-slate-500">
        Costs {cost} credit{cost > 1 ? 's' : ''}
      </p>
      {enough ? (
        <Link to={to} className="btn-primary mt-3 inline-block">
          Create link
        </Link>
      ) : (
        <a href="#buy-credits" className="btn-gold mt-3 inline-block">
          Need {cost - balance} more credit{cost - balance > 1 ? 's' : ''}
        </a>
      )}
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
