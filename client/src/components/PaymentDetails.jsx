import { resolveMediaUrl } from '../utils/format.js';

/**
 * Displays the company's payment collection options (UPI apps, UPI ID, QR, bank).
 */
export default function PaymentDetails({ payment = {}, compact = false }) {
  const bank = payment.bank || {};
  const qr = resolveMediaUrl(payment.upiQr);

  const apps = [
    { label: 'Google Pay', value: payment.gpayNumber },
    { label: 'PhonePe', value: payment.phonepeNumber },
    { label: 'Paytm', value: payment.paytmNumber },
    { label: 'UPI ID', value: payment.upiId },
  ].filter((a) => a.value);

  const hasBank = bank.accountNumber || bank.ifsc || bank.accountName;
  const nothing = apps.length === 0 && !qr && !hasBank;

  if (nothing) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Payment details are being set up. Please contact us to complete your booking.
      </p>
    );
  }

  return (
    <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
      <div className="space-y-3">
        {apps.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-bold text-slate-900">Pay via UPI apps</h4>
            <dl className="mt-2 space-y-1.5 text-sm">
              {apps.map((a) => (
                <div key={a.label} className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{a.label}</dt>
                  <dd className="font-medium text-slate-800">{a.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {hasBank && (
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-bold text-slate-900">Bank transfer</h4>
            <dl className="mt-2 space-y-1.5 text-sm">
              {bank.accountName && <Row label="Account name" value={bank.accountName} />}
              {bank.accountNumber && <Row label="Account no." value={bank.accountNumber} />}
              {bank.ifsc && <Row label="IFSC" value={bank.ifsc} />}
              {bank.bankName && <Row label="Bank" value={bank.bankName} />}
              {bank.branch && <Row label="Branch" value={bank.branch} />}
            </dl>
          </div>
        )}
      </div>

      {qr && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-900">Scan to pay</h4>
          <img src={qr} alt="UPI QR code" className="mt-3 h-44 w-44 rounded-lg object-contain" />
          {payment.upiId && <p className="mt-2 text-xs text-slate-500">{payment.upiId}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
