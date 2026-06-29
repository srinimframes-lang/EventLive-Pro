import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { packageService } from '../services/package.service.js';
import { bookingService } from '../services/booking.service.js';
import { formatCurrency } from '../utils/format.js';

export default function BookingNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState({
    package: searchParams.get('package') || '',
    eventTitle: '',
    brideName: '',
    groomName: '',
    eventDate: '',
    venue: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    packageService
      .list()
      .then((data) => {
        setPackages(data);
        if (!form.package && data[0]) setForm((f) => ({ ...f, package: data[0].id }));
      })
      .catch(() => setPackages([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.package) return setError('Please select a package.');
    setSubmitting(true);
    try {
      await bookingService.create(form);
      navigate('/dashboard', { state: { bookingSubmitted: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-slate-900">New booking enquiry</h1>
      <p className="mt-1 text-slate-600">
        Tell us about your wedding. To go live yourself, buy credits and create a link from your{' '}
        dashboard — payments are handled securely online.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Package */}
        <div className="card">
          <h2 className="text-lg font-bold text-slate-900">1. Choose your package</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {packages.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  form.package === p.id
                    ? 'border-brand-500 ring-2 ring-brand-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="package"
                  value={p.id}
                  checked={form.package === p.id}
                  onChange={change}
                  className="sr-only"
                />
                <span className="block font-bold text-slate-900">{p.name}</span>
                <span className="mt-1 block text-xl font-extrabold text-brand-700">
                  {formatCurrency(p.price, p.currency)}
                </span>
                {p.durationLabel && (
                  <span className="mt-1 block text-xs text-slate-500">{p.durationLabel}</span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Event details */}
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-slate-900">2. Wedding details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Bride name</label>
              <input name="brideName" className="input" value={form.brideName} onChange={change} />
            </div>
            <div>
              <label className="label">Groom name</label>
              <input name="groomName" className="input" value={form.groomName} onChange={change} />
            </div>
            <div>
              <label className="label">Event title (optional)</label>
              <input
                name="eventTitle"
                className="input"
                placeholder="e.g. Srinu & Mounika Wedding"
                value={form.eventTitle}
                onChange={change}
              />
            </div>
            <div>
              <label className="label">Wedding date & time</label>
              <input
                type="datetime-local"
                name="eventDate"
                className="input"
                value={form.eventDate}
                onChange={change}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Venue</label>
              <input name="venue" className="input" value={form.venue} onChange={change} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes (optional)</label>
              <textarea name="notes" rows="2" className="input" value={form.notes} onChange={change} />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit enquiry'}
        </button>
      </form>
    </div>
  );
}
