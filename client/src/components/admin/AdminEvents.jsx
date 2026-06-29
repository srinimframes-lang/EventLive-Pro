import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService } from '../../services/event.service.js';
import { formatDateTime } from '../../utils/format.js';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const load = () => {
    setLoading(true);
    eventService
      .list({ limit: 50 })
      .then((res) => setEvents(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const liveLink = (ev) => `${window.location.origin}/live/${ev.slug || ev.id}`;

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
    if (!window.confirm(`Delete event "${ev.title}"? This cannot be undone.`)) return;
    try {
      await eventService.remove(ev.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Events</h2>
        <Link to="/events/new" className="btn-primary">
          + Create event
        </Link>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-slate-600">No events yet. Approve a booking or create one.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const couple =
              ev.brideName && ev.groomName ? `${ev.brideName} & ${ev.groomName}` : null;
            return (
              <div key={ev.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{ev.title}</p>
                    {couple && <p className="text-sm text-slate-500">{couple}</p>}
                    <p className="text-sm text-slate-500">
                      {ev.organizer?.name ? `${ev.organizer.name} · ` : ''}
                      {formatDateTime(ev.startTime)}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">{liveLink(ev)}</p>
                  </div>
                  <span
                    className={`badge ${
                      ev.isLive ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ev.isLive ? 'LIVE' : ev.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={() => copyLink(ev)}>
                    {copiedId === ev.id ? 'Copied!' : 'Copy live link'}
                  </button>
                  <Link to={`/events/${ev.id}/studio`} className="btn-outline">
                    Studio
                  </Link>
                  <Link to={`/events/${ev.id}/edit`} className="btn-outline">
                    Edit
                  </Link>
                  <a
                    href={liveLink(ev)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-outline"
                  >
                    Watch
                  </a>
                  <button type="button" className="btn-outline text-red-600" onClick={() => remove(ev)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
