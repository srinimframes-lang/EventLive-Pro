/**
 * Shared DNS instruction table for white-label domain verification.
 * Builds rows from domain.verification.records when present, otherwise
 * from host + verifyToken so the admin UI never shows an empty flash only.
 */
const DEFAULT_TTL = 3600;
const CNAME_TARGET = 'cname.vercel-dns.com';

export default function DnsInstructions({ domain, className = '' }) {
  if (!domain?.host) return null;

  const records = resolveDnsRecords(domain);
  if (!records.length) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 ${className}`}>
        <p className="font-semibold">DNS verification token is missing for this domain.</p>
        <p className="mt-1">Remove and re-add the domain, or click Verify once to regenerate the token.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 ${className}`}>
      <p className="font-semibold text-slate-800">Add these DNS records at your domain registrar:</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3 font-semibold">Record Type</th>
              <th className="py-1.5 pr-3 font-semibold">Host / Name</th>
              <th className="py-1.5 pr-3 font-semibold">Value</th>
              <th className="py-1.5 font-semibold">TTL</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={`${r.type}-${r.host}-${i}`} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 font-mono font-bold text-slate-900">{r.type}</td>
                <td className="py-2 pr-3">
                  <code className="break-all rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-800 ring-1 ring-slate-200">
                    {r.host}
                  </code>
                </td>
                <td className="py-2 pr-3">
                  <code className="break-all rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-800 ring-1 ring-slate-200">
                    {r.value}
                  </code>
                </td>
                <td className="py-2 font-mono text-slate-600">{r.ttl ?? DEFAULT_TTL}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-slate-500">
        Some registrars want only the left-most label for Host (e.g. <code>_eventlive-verify</code> or{' '}
        <code>live</code>). After saving DNS, wait a few minutes, then click Verify.
      </p>
    </div>
  );
}

export function resolveDnsRecords(domain) {
  const v = domain?.verification;
  if (Array.isArray(v?.records) && v.records.length > 0) {
    return v.records.map((r) => ({
      type: r.type,
      host: r.host || r.name || '',
      value: r.value || '',
      ttl: r.ttl ?? DEFAULT_TTL,
    }));
  }

  const token = String(v?.value || domain?.verifyToken || '').trim();
  const host = String(domain?.host || '').trim().toLowerCase();
  if (!host || !token) return [];

  return [
    {
      type: 'TXT',
      host: v?.host || v?.name || `_eventlive-verify.${host}`,
      value: token,
      ttl: v?.ttl ?? DEFAULT_TTL,
    },
    {
      type: 'CNAME',
      host: v?.cname?.host || v?.cname?.name || host,
      value: v?.cname?.value || CNAME_TARGET,
      ttl: v?.cname?.ttl ?? DEFAULT_TTL,
    },
  ];
}
