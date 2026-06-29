import { useCallback, useEffect, useState } from 'react';
import { paymentService } from '../services/payment.service.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatCurrency, formatDateTime, resolveMediaUrl } from '../utils/format.js';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

/**
 * UPI QR purchase flow:
 *  1. Pick a credit pack.
 *  2. Scan the company QR / pay to the UPI ID.
 *  3. Tap "I Have Paid" → a pending request is sent to the Super Admin.
 *  Credits are added only after the admin approves the request.
 */
export default function BuyCreditsPanel() {
  const { settings } = useSettings();
  const [products, setProducts] = useState([]);
  const [upi, setUpi] = useState({ upiId: '', upiName: '', upiQr: '' });
  const [selected, setSelected] = useState('youtube');
  const [reference, setReference] = useState('');
  const [requests, setRequests] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const loadMine = useCallback(() => {
    paymentService
      .mine()
      .then(setRequests)
      .catch(() => {});
  }, []);

  useEffect(() => {
    paymentService
      .products()
      .then((d) => {
        setProducts(d.products || []);
        if (d.upi) setUpi(d.upi);
      })
      .catch((e) => setError(e.message));
    loadMine();
  }, [loadMine]);

  // Prefer the live settings QR/UPI (kept in sync after admin edits).
  const pay = settings?.payment || {};
  const upiId = pay.upiId || upi.upiId;
  const upiName = pay.upiName || upi.upiName;
  const qr = resolveMediaUrl(pay.upiQr || upi.upiQr);

  const product = products.find((p) => p.id === selected);

  const iHavePaid = async () => {
    if (!product) return;
    setSubmitting(true);
    setError('');
    setDone(false);
    try {
      await paymentService.request(product.id, reference);
      setDone(true);
      setReference('');
      loadMine();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const noUpi = !upiId && !qr;

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-slate-900">Buy credits</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pay with any UPI app, then tap <strong>I Have Paid</strong>. Credits are added once we verify
        your payment.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Payment request submitted. Your credits will appear here once an admin approves it.
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* Step 1: choose a pack */}
        <div className="card">
          <h3 className="text-sm font-bold text-slate-900">1. Choose a pack</h3>
          <div className="mt-3 space-y-3">
            {products.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${
                  selected === p.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="product"
                    checked={selected === p.id}
                    onChange={() => setSelected(p.id)}
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">
                      {p.credits} credit{p.credits > 1 ? 's' : ''}
                    </span>
                    <span className="block text-xs text-slate-500">{p.name}</span>
                  </span>
                </span>
                <span className="text-lg font-extrabold text-slate-900">
                  {formatCurrency(p.price)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Step 2: pay via QR */}
        <div className="card">
          <h3 className="text-sm font-bold text-slate-900">2. Scan &amp; pay</h3>
          {noUpi ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Payment details are being set up. Please contact us to add credits.
            </p>
          ) : (
            <div className="mt-3 flex flex-col items-center text-center">
              {qr ? (
                <img
                  src={qr}
                  alt="UPI QR code"
                  className="h-48 w-48 rounded-xl border border-slate-200 object-contain p-1"
                />
              ) : (
                <div className="grid h-48 w-48 place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
                  QR not set
                </div>
              )}
              <dl className="mt-3 w-full space-y-1.5 text-sm">
                {upiName && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Account holder</dt>
                    <dd className="font-semibold text-slate-900">{upiName}</dd>
                  </div>
                )}
                {upiId && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">UPI ID</dt>
                    <dd className="font-medium text-slate-800">{upiId}</dd>
                  </div>
                )}
                {product && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Amount</dt>
                    <dd className="font-bold text-brand-700">
                      {formatCurrency(product.price)} · {product.credits} credit
                      {product.credits > 1 ? 's' : ''}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 w-full">
                <label className="label text-left">UPI reference / UTR (optional)</label>
                <input
                  className="input"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Helps us verify faster"
                />
              </div>

              <button
                type="button"
                className="btn-primary mt-4 w-full"
                disabled={submitting || !product}
                onClick={iHavePaid}
              >
                {submitting ? 'Submitting…' : 'I Have Paid'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Request history */}
      {requests.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-900">Your payment requests</h3>
          <ul className="mt-3 space-y-2">
            {requests.map((r) => (
              <li
                key={r.id || r._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {r.credits} credit{r.credits > 1 ? 's' : ''} · {formatCurrency(r.amount)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(r.createdAt)}
                    {r.reviewNote ? ` · ${r.reviewNote}` : ''}
                  </p>
                </div>
                <span className={`badge ${STATUS_STYLES[r.status] || ''}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
