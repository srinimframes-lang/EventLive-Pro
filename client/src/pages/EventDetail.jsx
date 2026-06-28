import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatDateTime } from '../utils/format.js';

export default function EventDetail() {
  const { idOrSlug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService
      .get(idOrSlug)
      .then((data) => active && setEvent(data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [idOrSlug]);

  const canManage =
    event &&
    user &&
    (user.role === 'admin' || event.organizer?.id === user.id || event.organizer?._id === user.id);

  const handleDelete = async () => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await eventService.remove(event.id);
      navigate('/events', { replace: true });
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  if (loading) return <p className="py-20 text-center text-slate-500">Loading…</p>;
  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        <Link to="/events" className="btn-ghost mt-4">
          Back to events
        </Link>
      </div>
    );
  if (!event) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/events" className="text-sm text-brand-600 hover:underline">
        ← Back to events
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-700">
              {event.category}
            </span>
            <StatusBadge status={event.status} />
          </div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{event.title}</h1>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <Link to={`/events/${event.id}/edit`} className="btn-ghost">
              Edit
            </Link>
            <button
              type="button"
              className="btn bg-red-600 text-white hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      <div className="card mt-6 grid gap-4 sm:grid-cols-2">
        <Detail label="Starts" value={formatDateTime(event.startTime)} />
        <Detail label="Ends" value={formatDateTime(event.endTime)} />
        <Detail label="Location" value={event.isOnline ? 'Online' : event.location} />
        <Detail label="Capacity" value={event.capacity ? event.capacity : 'Unlimited'} />
        <Detail label="Organizer" value={event.organizer?.name || '—'} />
        <Detail label="Attendees" value={event.attendeesCount ?? 0} />
      </div>

      {event.streamUrl && event.isOnline && (
        <a
          href={event.streamUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-primary mt-4 inline-flex"
        >
          Open stream
        </a>
      )}

      <div className="card mt-6">
        <h2 className="text-lg font-bold text-slate-900">About this event</h2>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{event.description}</p>
        {event.tags?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {event.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
