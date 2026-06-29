import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { resellerService } from '../services/reseller.service.js';
import PaymentDetails from '../components/PaymentDetails.jsx';
import { formatCurrency, formatDateTime, formatDate } from '../utils/format.js';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function Reseller() {
  const { user, refreshUser } = useAuth();
  const { settings } = useSettings();

  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, myOrders, myEvents] = await Promise.all([
        resellerService.me(),
        resellerService.myOrders(),
        resellerService.myEvents(),
      ]);
      setData(me);
      setOrders(myOrders);
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

  if (loading && !data) return <p className="py-20 text-center text-slate-500">Loading…</p>;

  const credits = data?.credits || user?.credits || { youtube: 0, server: 0 };
  const pricing = data?.pricing || { youtube: 100, server: 500 };
  const totalCredits = (credits.youtube || 0) + (credits.server || 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Reseller Dashboard</h1>
          <p className="mt-1 text-slate-600">
            Welcome{user?.name ? `, ${user.name}` : ''}. Manage your credits and live events.
          </p>
        </div>
        {totalCredits > 0 ? (
          <Link to="/events/new" className="btn-primary">
            + Create event
          </Link>
        ) : (
          <a href="#buy" className="btn-gold">
            Buy credits to start
          </a>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Credit balances */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <CreditCard
          title="YouTube credits"
          subtitle={`1 YouTube event = 1 credit · ${formatCurrency(pricing.youtube)}`}
          value={credits.youtube || 0}
          tone="brand"
        />
        <CreditCard
          title="Private server credits"
          subtitle={`1 server event = 1 credit · ${formatCurrency(pricing.server)}`}
          value={credits.server || 0}
          tone="gold"
        />
      </div>

      {totalCredits === 0 && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have no credits yet. Purchase credits below to create your first live event.
        </p>
      )}

      {/* Buy credits */}
      <BuyCredits pricing={pricing} payment={settings.payment} onDone={load} />

      {/* My events */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-slate-900">My events</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-slate-500">No events yet. Create one using your credits.</p>
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
                  <Link to={`/events/${ev.slug || ev.id || ev._id}/live`} className="btn-primary">
                    Watch
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Credit orders */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-slate-900">My credit orders</h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-slate-500">No top-up orders yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {orders.map((o) => (
              <div
                key={o.id || o._id}
                className="card flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {o.quantity} × {o.type === 'server' ? 'Server' : 'YouTube'} credit ·{' '}
                    {formatCurrency(o.amount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(o.createdAt)}
                    {o.paymentReference ? ` · Ref ${o.paymentReference}` : ''}
                    {o.adminNote ? ` · ${o.adminNote}` : ''}
                  </p>
                </div>
                <span className={`badge ${STATUS_STYLES[o.status] || ''}`}>{o.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ledger */}
      {data?.transactions?.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-slate-900">Recent activity</h2>
          <div className="mt-3 space-y-1.5">
            {data.transactions.map((t) => (
              <div
                key={t.id || t._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {labelForReason(t.reason)} · {t.type}
                  {t.note ? ` — ${t.note}` : ''}
                </span>
                <span className={t.amount >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                  {t.amount >= 0 ? '+' : ''}
                  {t.amount}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function labelForReason(reason) {
  const map = {
    manual_add: 'Credit added',
    manual_remove: 'Credit removed',
    purchase: 'Purchase approved',
    event_deduct: 'Event created',
    refund: 'Refund',
  };
  return map[reason] || reason;
}

function CreditCard({ title, subtitle, value, tone }) {
  const ring = tone === 'gold' ? 'from-gold-50 to-white' : 'from-brand-50 to-white';
  return (
    <div className={`card bg-gradient-to-br ${ring}`}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-4xl font-extrabold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function BuyCredits({ pricing, payment, onDone }) {
  const [type, setType] = useState('youtube');
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [paymentReference, setPaymentReference] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const unit = pricing[type] || 0;
  const qty = Math.max(1, Number(quantity) || 0);
  const amount = unit * qty;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setDone(false);
    setSubmitting(true);
    try {
      await resellerService.buyCredits({
        type,
        quantity: qty,
        paymentMethod,
        paymentReference,
        screenshot,
      });
      setDone(true);
      setQuantity(1);
      setPaymentReference('');
      setScreenshot(null);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="buy" className="mt-10 scroll-mt-20">
      <h2 className="font-display text-xl font-bold text-slate-900">Buy credits</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pay using the details below, then submit this form with your payment reference. Credits are
        added once your payment is verified.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="card space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {done && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Order submitted. We&apos;ll verify your payment and add the credits shortly.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ct" className="label">
                Credit type
              </label>
              <select
                id="ct"
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="youtube">YouTube event ({formatCurrency(pricing.youtube)})</option>
                <option value="server">Private server event ({formatCurrency(pricing.server)})</option>
              </select>
            </div>
            <div>
              <label htmlFor="qty" className="label">
                Quantity
              </label>
              <input
                id="qty"
                type="number"
                min={1}
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total payable</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(amount)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pm" className="label">
                Payment method
              </label>
              <select
                id="pm"
                className="input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="upi">UPI</option>
                <option value="gpay">Google Pay</option>
                <option value="phonepe">PhonePe</option>
                <option value="paytm">Paytm</option>
                <option value="bank">Bank transfer</option>
              </select>
            </div>
            <div>
              <label htmlFor="ref" className="label">
                Payment reference / UTR
              </label>
              <input
                id="ref"
                className="input"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. 4567XXXX"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ss" className="label">
              Payment screenshot
            </label>
            <input
              id="ss"
              type="file"
              accept="image/*"
              onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Submitting…' : `Submit order · ${formatCurrency(amount)}`}
          </button>
        </form>

        <div className="card">
          <h3 className="text-sm font-bold text-slate-900">Pay to</h3>
          <div className="mt-3">
            <PaymentDetails payment={payment} compact />
          </div>
        </div>
      </div>
    </section>
  );
}
