import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { eventService } from '../services/event.service.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatDateTime } from '../utils/format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    eventService
      .list({ mine: true, limit: 50 })
      .then((res) => active && setEvents(res.data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: events.length,
      upcoming: events.filter((e) => new Date(e.startTime).getTime() > now).length,
      live: events.filter((e) => e.status === 'live').length,
    };
  }, [events]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Welcome back, {user?.name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="mt-1 text-slate-600">Here is your event control center.</p>
        </div>
        <Link to="/events/new" className="btn-primary">
          + Create event
        </Link>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Your events" value={stats.total} />
        <StatCard label="Upcoming" value={stats.upcoming} />
        <StatCard label="Live now" value={stats.live} />
      </div>

      <div className="card mt-6">
        <h2 className="text-lg font-bold text-slate-900">Your events</h2>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {loading ? (
          <p className="mt-4 text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="mt-4 text-slate-600">
            You haven&apos;t created any events yet.{' '}
            <Link to="/events/new" className="font-semibold text-brand-600 hover:underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/events/${event.slug || event.id}`}
                    className="font-medium text-slate-800 hover:text-brand-700"
                  >
                    {event.title}
                  </Link>
                  <p className="text-xs text-slate-500">{formatDateTime(event.startTime)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={event.status} />
                  <Link to={`/events/${event.id}/edit`} className="text-sm text-brand-600 hover:underline">
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card mt-6">
        <h2 className="text-lg font-bold text-slate-900">Your account</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="Name" value={user?.name} />
          <Info label="Email" value={user?.email} />
          <Info label="Role" value={user?.role} capitalize />
        </dl>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function Info({ label, value, capitalize }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${capitalize ? 'capitalize' : ''}`}>{value}</dd>
    </div>
  );
}
