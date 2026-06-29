import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { bookingService } from '../services/booking.service.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';

const STATUS_META = {
  pending: { label: 'Payment Verification Pending', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const justSubmitted = location.state?.bookingSubmitted;

  useEffect(() => {
    let active = true;
    bookingService
      .mine()
      .then((data) => active && setBookings(data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            Welcome, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="mt-1 text-slate-600">Manage your wedding bookings and live events.</p>
        </div>
        <Link to="/book" className="btn-primary">
          + New booking
        </Link>
      </div>

      {justSubmitted && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your booking was submitted. Our team will verify your payment and activate your event
          shortly.
        </div>
      )}

      <div className="card mt-8">
        <h2 className="text-lg font-bold text-slate-900">Your bookings</h2>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {loading ? (
          <p className="mt-4 text-slate-500">Loading…</p>
        ) : bookings.length === 0 ? (
          <p className="mt-4 text-slate-600">
            You have no bookings yet.{' '}
            <Link to="/book" className="font-semibold text-brand-600 hover:underline">
              Book your wedding stream
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {bookings.map((b) => {
              const meta = STATUS_META[b.status] || STATUS_META.pending;
              const couple =
                b.brideName && b.groomName ? `${b.brideName} & ${b.groomName}` : b.eventTitle;
              return (
                <li key={b.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {couple || 'Wedding booking'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {b.packageName} · {formatCurrency(b.amount)}
                        {b.eventDate && <> · {formatDateTime(b.eventDate)}</>}
                      </p>
                    </div>
                    <span className={`badge ${meta.cls}`}>{meta.label}</span>
                  </div>

                  {b.status === 'rejected' && b.adminNote && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      {b.adminNote}
                    </p>
                  )}

                  {b.status === 'approved' && b.event && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={`/events/${b.event.id}/studio`} className="btn-outline">
                        Manage stream
                      </Link>
                      <Link
                        to={`/events/${b.event.slug || b.event.id}/edit`}
                        className="btn-outline"
                      >
                        Edit details
                      </Link>
                      <Link
                        to={`/events/${b.event.slug || b.event.id}/live`}
                        className="btn-primary"
                      >
                        Open watch page
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card mt-6">
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
