import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { paymentService } from '../services/payment.service.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const { refreshUser } = useAuth();
  const [state, setState] = useState({ loading: true, status: '', credits: 0, error: '' });

  useEffect(() => {
    const mtid = params.get('mtid') || localStorage.getItem('lastPaymentMtid');
    if (!mtid) {
      setState({ loading: false, status: 'unknown', error: 'No payment reference found.' });
      return;
    }
    paymentService
      .status(mtid)
      .then(async (d) => {
        setState({ loading: false, status: d.status, credits: d.credits, error: '' });
        if (d.status === 'paid') {
          localStorage.removeItem('lastPaymentMtid');
          await refreshUser();
        }
      })
      .catch((e) => setState({ loading: false, status: 'error', error: e.message }));
  }, [params, refreshUser]);

  const paid = state.status === 'paid';

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      {state.loading ? (
        <p className="text-slate-500">Confirming your payment…</p>
      ) : (
        <div className="card">
          {paid ? (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 text-2xl text-green-700">
                ✓
              </div>
              <h1 className="mt-3 font-display text-2xl font-bold text-slate-900">Payment successful</h1>
              <p className="mt-1 text-slate-600">
                {state.credits} credit{state.credits > 1 ? 's' : ''} have been added to your account.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl text-amber-700">
                !
              </div>
              <h1 className="mt-3 font-display text-2xl font-bold text-slate-900">
                Payment {state.status || 'not completed'}
              </h1>
              <p className="mt-1 text-slate-600">
                {state.error || 'If money was deducted, it will reflect shortly or be refunded.'}
              </p>
            </>
          )}
          <Link to="/dashboard" className="btn-primary mt-5 inline-block">
            Go to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
