import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge.jsx';
import { formatDateTime } from '../utils/format.js';

export default function EventCard({ event }) {
  return (
    <Link
      to={`/events/${event.slug || event.id}`}
      className="card group flex flex-col transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-700">
          {event.category}
        </span>
        <StatusBadge status={event.status} />
      </div>

      <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-700">
        {event.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{event.description}</p>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{formatDateTime(event.startTime)}</span>
        <span>{event.isOnline ? 'Online' : event.location}</span>
      </div>

      {event.organizer?.name && (
        <p className="mt-2 text-xs text-slate-400">by {event.organizer.name}</p>
      )}
    </Link>
  );
}
