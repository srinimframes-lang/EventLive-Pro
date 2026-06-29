import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext.jsx';
import { packageService } from '../services/package.service.js';
import { bookingService } from '../services/booking.service.js';
import PaymentDetails from '../components/PaymentDetails.jsx';
import { formatCurrency } from '../utils/format.js';

export default function BookingNew() {
  const { settings } = useSettings();
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
    paymentMethod: '',
    paymentReference: '',
    notes: '',
  });
  const [screenshot, setScreenshot] = useState(null);
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

  const selected = useMemo(
    () => packages.find((p) => p.id === form.package),
    [packages, form.package]
  );

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.package) return setError('Please select a package.');
    if (!screenshot) return setError('Please upload your payment screenshot.');
    setSubmitting(true);
    try {
      await bookingService.create({ ...form, screenshot });
      navigate('/dashboard', { state: { bookingSubmitted: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-slate-900">New booking</h1>
      <p className="mt-1 text-slate-600">
        Tell us about your wedding, pay the package amount, and upload the receipt. Our team will
        verify your payment and activate your event.
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

        {/* Payment */}
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">3. Make the payment</h2>
            {selected && (
              <span className="badge bg-brand-100 text-brand-700">
                Amount: {formatCurrency(selected.price, selected.currency)}
              </span>
            )}
          </div>
          <PaymentDetails payment={settings.payment} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Paid via</label>
              <select name="paymentMethod" className="input" value={form.paymentMethod} onChange={change}>
                <option value="">Select…</option>
                <option value="gpay">Google Pay</option>
                <option value="phonepe">PhonePe</option>
                <option value="paytm">Paytm</option>
                <option value="upi">UPI ID</option>
                <option value="bank">Bank transfer</option>
              </select>
            </div>
            <div>
              <label className="label">Transaction / reference ID</label>
              <input
                name="paymentReference"
                className="input"
                value={form.paymentReference}
                onChange={change}
              />
            </div>
          </div>

          <div>
            <label className="label">Payment screenshot *</label>
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Upload a clear screenshot of your successful payment.
            </p>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit booking for approval'}
        </button>
      </form>
    </div>
  );
}
