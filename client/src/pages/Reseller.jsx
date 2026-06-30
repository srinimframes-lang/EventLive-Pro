import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { resellerService } from '../services/reseller.service.js';
import BuyCreditsPanel from '../components/BuyCreditsPanel.jsx';
import { formatDateTime, watchPath } from '../utils/format.js';

const LINK_COSTS = { youtube: 1, server: 5 };

export default function Reseller() {
  const { user, refreshUser } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const myEvents = await resellerService.myEvents();
      setEvents(myEvents);
      refreshUser();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    load();
  }, [load]);

  const balance = user?.creditBalance ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Reseller Dashboard</h1>
          <p className="mt-1 text-slate-600">
            Welcome{user?.name ? `, ${user.name}` : ''}. Manage your credits and live links.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card bg-gradient-to-br from-brand-50 to-white">
          <p className="text-sm font-medium text-slate-600">Credit balance</p>
          <p className="mt-1 text-5xl font-extrabold text-slate-900">{balance}</p>
          <p className="mt-1 text-xs text-slate-500">YouTube link 1 · Server link 5</p>
        </div>
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900">Create a live link</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CreateCard title="YouTube Live Link" cost={LINK_COSTS.youtube} balance={balance} to="/events/new?type=youtube" />
            <CreateCard title="Server Live Link" cost={LINK_COSTS.server} balance={balance} to="/events/new?type=server" />
          </div>
        </div>
      </div>

      <div id="buy-credits" className="mt-8 scroll-mt-20">
        <BuyCreditsPanel />
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-slate-900">My live links</h2>
        {loading ? (
          <p className="mt-3 text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="mt-3 text-slate-500">No links yet. Create one above.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id || ev._id}
                className="card flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{ev.title}</p>
                  <p className="text-xs text-slate-500">
                    {ev.startTime ? formatDateTime(ev.startTime) : '—'} ·{' '}
                    <span className="capitalize">{ev.status}</span>
                    {ev.creditType && ev.creditType !== 'none' ? ` · ${ev.creditType}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/events/${ev.id || ev._id}/studio`} className="btn-outline">
                    Studio
                  </Link>
                  <Link to={`/events/${ev.slug || ev.id || ev._id}/edit`} className="btn-outline">
                    Edit
                  </Link>
                  <Link to={watchPath(ev)} className="btn-primary">
                    Watch
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
          Need {cost - balance} more
        </a>
      )}
    </div>
  );
}
