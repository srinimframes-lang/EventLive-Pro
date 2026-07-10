import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import PhotoGallery from '../components/PhotoGallery.jsx';
import PhotographyStudio from '../components/PhotographyStudio.jsx';
import EventSeo from '../components/seo/EventSeo.jsx';
import { coverImageAlt } from '../utils/seo.js';
import EventQrCard from '../components/EventQrCard.jsx';
import { formatDateTime, resolveMediaUrl, watchPath as buildWatchPath } from '../utils/format.js';

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

  // The Super Admin manages any event; a reseller manages events they created.
  const canManage =
    Boolean(event) &&
    user &&
    (user.role === 'admin' ||
      (user.role === 'subadmin' &&
        (event.organizer?.id === user.id || event.organizer?._id === user.id)));

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

  const coupleTitle =
    event.brideName && event.groomName
      ? `${event.groomName} & ${event.brideName}`
      : event.brideName || event.groomName || '';
  const watchPath = buildWatchPath(event);

  return (
    <>
      <EventSeo event={event} pageType="detail" />
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <Link to="/events" className="text-sm text-brand-600 hover:underline">
        ← Back to events
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-700">
              {event.category}
            </span>
            <StatusBadge status={event.status} />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{event.title}</h1>
          {coupleTitle && (
            <p className="mt-1 text-lg font-medium text-brand-700">{coupleTitle}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to={watchPath}
            className={event.isLive ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}
          >
            {event.isLive ? '● Watch live' : 'Watch'}
          </Link>
          {canManage && (
            <>
              <Link to={`/events/${event.id}/studio`} className="btn-ghost">
                Studio
              </Link>
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
            </>
          )}
        </div>
      </div>

      {canManage && (
        <div className="mt-6">
          <EventQrCard event={event} />
        </div>
      )}

      {event.coverImage && (
        <img
          src={resolveMediaUrl(event.coverImage)}
          alt={coverImageAlt(event)}
          loading="lazy"
          decoding="async"
          className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover shadow-sm"
        />
      )}

      <div className="card mt-6 grid gap-4 sm:grid-cols-2">
        <Detail label="Starts" value={formatDateTime(event.startTime)} />
        <Detail label="Ends" value={formatDateTime(event.endTime)} />
        <Detail label="Location" value={event.isOnline ? 'Online' : event.location} />
        {event.venue && <Detail label="Venue" value={event.venue} />}
        <Detail label="Capacity" value={event.capacity ? event.capacity : 'Unlimited'} />
        <Detail label="Organizer" value={event.organizer?.name || '—'} />
        <Detail label="Attendees" value={event.attendeesCount ?? 0} />
      </div>

      {event.isOnline && (
        <Link to={watchPath} className="btn-primary mt-4 inline-flex w-full justify-center sm:w-auto">
          {event.isLive ? '● Open live stream' : 'Open stream'}
        </Link>
      )}

      <PhotographyStudio event={event} />

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

      {event.gallery?.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Photo gallery</h2>
            <span className="text-sm text-slate-500">{event.gallery.length} photos</span>
          </div>
          <PhotoGallery photos={event.gallery} event={event} />
        </div>
      )}
    </div>
    </>
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
