import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService, EVENT_CATEGORIES } from '../services/event.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import EventCard from '../components/EventCard.jsx';

export default function Events() {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ search: '', category: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const params = { page: filters.page, limit: 9 };
    if (filters.search) params.search = filters.search;
    if (filters.category) params.category = filters.category;

    eventService
      .list(params)
      .then((res) => {
        if (active) setState(res);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [filters]);

  const update = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Events</h1>
          <p className="mt-1 text-slate-600">Discover and join upcoming live events.</p>
        </div>
        {isAuthenticated && (
          <Link to="/events/new" className="btn-primary">
            + Create event
          </Link>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search events…"
          className="input max-w-xs"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
        />
        <select
          className="input max-w-[12rem]"
          value={filters.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          <option value="">All categories</option>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="mt-10 text-center text-slate-500">Loading events…</p>
      ) : state.data.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-600">No events found.</p>
          {isAuthenticated && (
            <Link to="/events/new" className="btn-primary mt-4">
              Create the first one
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {state.data.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>

          {state.pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn-ghost"
                disabled={state.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {state.page} of {state.pages}
              </span>
              <button
                type="button"
                className="btn-ghost"
                disabled={state.page >= state.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
