import { useCallback, useEffect, useState } from 'react';
import { paymentService } from '../services/payment.service.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatCurrency, formatDateTime, resolveMediaUrl } from '../utils/format.js';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(window.Razorpay);
      return;
    }
    const existing = document.querySelector('script[data-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpay = '1';
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    document.body.appendChild(script);
  });
}

/**
 * Credit purchase:
 *  1. Prefer Razorpay Checkout when enabled (auto-credits after verify).
 *  2. Manual UPI QR remains available as fallback (admin approval).
 */
export default function BuyCreditsPanel() {
  const { settings } = useSettings();
  const [products, setProducts] = useState([]);
  const [upi, setUpi] = useState({
    upiId: '',
    upiName: '',
    upiQr: '',
    phonepeNumber: '',
    gpayNumber: '',
    instructions: '',
  });
  const [razorpay, setRazorpay] = useState({ enabled: false, keyId: '' });
  const [payMode, setPayMode] = useState('razorpay'); // razorpay | upi
  const [selected, setSelected] = useState('');
  const [reference, setReference] = useState('');
  const [requests, setRequests] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

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
        const list = d.products || [];
        setProducts(list);
        setSelected((cur) => cur || list[0]?.id || '');
        if (d.upi) setUpi((prev) => ({ ...prev, ...d.upi }));
        const rz = d.razorpay || { enabled: false, keyId: '' };
        setRazorpay(rz);
        setPayMode(rz.enabled ? 'razorpay' : 'upi');
      })
      .catch((e) => setError(e.message));
    loadMine();
  }, [loadMine]);

  const pay = settings?.payment || {};
  const upiId = pay.upiId || upi.upiId;
  const upiName = pay.upiName || upi.upiName;
  const phonepeNumber = pay.phonepeNumber || upi.phonepeNumber;
  const gpayNumber = pay.gpayNumber || upi.gpayNumber;
  const instructions = pay.instructions || upi.instructions;
  const qr = resolveMediaUrl(pay.upiQr || upi.upiQr);

  const product = products.find((p) => p.id === selected);
  const noUpi = !upiId && !qr && !phonepeNumber && !gpayNumber;
  const showRazorpay = razorpay.enabled && payMode === 'razorpay';

  const iHavePaid = async () => {
    if (!product) return;
    setSubmitting(true);
    setError('');
    setDone('');
    try {
      await paymentService.request(product.id, reference);
      setDone('Payment request submitted. Your credits will appear once an admin approves it.');
      setReference('');
      loadMine();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const payWithRazorpay = async () => {
    if (!product || !razorpay.enabled) return;
    setSubmitting(true);
    setError('');
    setDone('');
    let orderMeta = null;
    try {
      orderMeta = await paymentService.createRazorpayOrder(product.id);
      const RazorpayCtor = await loadRazorpayScript();
      await new Promise((resolve, reject) => {
        const options = {
          key: orderMeta.keyId,
          amount: orderMeta.amount,
          currency: orderMeta.currency || 'INR',
          name: settings?.companyName || 'EventLive Pro',
          description: `${orderMeta.product.credits} credit(s)`,
          order_id: orderMeta.orderId,
          prefill: orderMeta.prefill || {},
          theme: { color: '#0f766e' },
          handler: async (response) => {
            try {
              const result = await paymentService.verifyRazorpay({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              setDone(
                result.message ||
                  `Payment successful. Balance: ${result.creditBalance ?? '—'} credit(s).`
              );
              loadMine();
              resolve(result);
            } catch (err) {
              setError(err.message || 'Payment verification failed');
              reject(err);
            }
          },
          modal: {
            ondismiss: async () => {
              try {
                await paymentService.cancelRazorpay({
                  orderId: orderMeta.orderId,
                  paymentId: orderMeta.paymentId,
                });
                loadMine();
              } catch {
                /* ignore */
              }
              resolve(null);
            },
          },
        };
        const rzp = new RazorpayCtor(options);
        rzp.on('payment.failed', () => {
          setError('Payment failed or was declined. You can retry or use UPI.');
        });
        rzp.open();
      });
    } catch (e) {
      setError(e.message || 'Could not start Razorpay checkout');
      if (orderMeta?.orderId) {
        try {
          await paymentService.cancelRazorpay({
            orderId: orderMeta.orderId,
            paymentId: orderMeta.paymentId,
          });
        } catch {
          /* ignore */
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-slate-900">Buy credits</h2>
      <p className="mt-1 text-sm text-slate-600">
        {razorpay.enabled
          ? 'Pay securely with Razorpay. Credits are added automatically after a successful payment. UPI remains available as a fallback.'
          : (
            <>
              Pay with any UPI app, then tap <strong>I Have Paid</strong>. Credits are added once we
              verify your payment.
            </>
          )}
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{done}</p>
      )}

      {razorpay.enabled && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              payMode === 'razorpay' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => setPayMode('razorpay')}
          >
            Pay with Razorpay
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              payMode === 'upi' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => setPayMode('upi')}
          >
            Pay with UPI (manual)
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
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

        <div className="card">
          {showRazorpay ? (
            <>
              <h3 className="text-sm font-bold text-slate-900">2. Pay with Razorpay</h3>
              <p className="mt-2 text-sm text-slate-600">
                You will be charged{' '}
                <strong>{product ? formatCurrency(product.price) : '—'}</strong>
                {product ? ` for ${product.credits} credit${product.credits > 1 ? 's' : ''}` : ''}.
                Amount is set by the server — not editable in checkout.
              </p>
              <button
                type="button"
                className="btn-primary mt-4 w-full"
                disabled={submitting || !product}
                onClick={payWithRazorpay}
              >
                {submitting ? 'Opening checkout…' : 'Pay securely'}
              </button>
              <p className="mt-3 text-xs text-slate-400">
                Test Mode cards work when Razorpay Test keys are configured on the server.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-slate-900">2. Scan &amp; pay (UPI)</h3>
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
                    {phonepeNumber && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">PhonePe</dt>
                        <dd className="font-medium text-slate-800">{phonepeNumber}</dd>
                      </div>
                    )}
                    {gpayNumber && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">Google Pay</dt>
                        <dd className="font-medium text-slate-800">{gpayNumber}</dd>
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

                  {instructions && (
                    <p className="mt-3 w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-600">
                      {instructions}
                    </p>
                  )}

                  <div className="mt-4 w-full">
                    <label className="label text-left">Transaction ID / Reference number</label>
                    <input
                      className="input"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="UPI transaction ID or UTR"
                    />
                    <p className="mt-1 text-left text-xs text-slate-400">
                      Enter the transaction ID from your payment app so we can verify it faster.
                    </p>
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
            </>
          )}
        </div>
      </div>

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
                    {r.method ? ` · ${r.method === 'razorpay' ? 'Razorpay' : 'UPI'}` : ''}
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
