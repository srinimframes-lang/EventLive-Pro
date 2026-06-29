import { useEffect, useState } from 'react';
import { paymentService } from '../services/payment.service.js';
import { formatCurrency } from '../utils/format.js';

/**
 * Shows the credit products and starts a PhonePe payment when one is chosen.
 * On click we create the order, remember its id, and redirect to the gateway
 * (or, in mock mode, straight to the payment-return page).
 */
export default function BuyCreditsPanel() {
  const [products, setProducts] = useState([]);
  const [gatewayConfigured, setGatewayConfigured] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService
      .products()
      .then((d) => {
        setProducts(d.products || []);
        setGatewayConfigured(d.gatewayConfigured);
      })
      .catch((e) => setError(e.message));
  }, []);

  const buy = async (productId) => {
    setBusy(productId);
    setError('');
    try {
      const { redirectUrl, merchantTransactionId } = await paymentService.create(productId);
      if (merchantTransactionId) {
        localStorage.setItem('lastPaymentMtid', merchantTransactionId);
      }
      window.location.href = redirectUrl;
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-slate-900">Buy credits</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pay securely with PhonePe / UPI. Credits are added to your account automatically after
        payment.
      </p>
      {!gatewayConfigured && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Demo mode: the live gateway keys are not configured yet, so payments are simulated and
          credits are granted on return.
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {products.map((p) => (
          <div key={p.id} className="card flex flex-col">
            <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{p.description}</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-extrabold text-slate-900">{formatCurrency(p.price)}</span>
              <span className="mb-1 text-sm text-slate-500">· {p.credits} credit{p.credits > 1 ? 's' : ''}</span>
            </div>
            <button
              type="button"
              className="btn-primary mt-4"
              disabled={busy === p.id}
              onClick={() => buy(p.id)}
            >
              {busy === p.id ? 'Redirecting…' : `Buy for ${formatCurrency(p.price)}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
