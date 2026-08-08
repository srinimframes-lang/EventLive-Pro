/**
 * Shared DNS instruction table for white-label domain verification.
 * Host / Name fields always use relative labels (never the full domain FQDN).
 *
 * Recommended: keep the existing website on the root (@), and point only
 * live.<domain> at EventLivePro via CNAME → cname.vercel-dns.com.
 * Apex A → 76.76.21.21 is legacy and would take over the root site.
 */

const DEFAULT_TTL = 3600;
const CNAME_TARGET = 'cname.vercel-dns.com';
const VERCEL_A_IP = '76.76.21.21';
const TXT_HOST_LABEL = '_eventlive-verify';

const MULTI_PART_TLDS = new Set([
  'co.in',
  'com.in',
  'net.in',
  'org.in',
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'co.za',
  'com.br',
  'com.mx',
  'co.jp',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.tr',
  'co.kr',
  'com.ar',
  'com.my',
  'com.ph',
  'com.vn',
  'co.id',
  'com.cn',
]);

export function isApexHostname(host) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!h) return true;
  const parts = h.split('.').filter(Boolean);
  if (parts.length < 2) return true;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) return parts.length === 3;
  return parts.length === 2;
}

export function recommendedLiveHostname(host) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  if (!h) return '';
  if (!isApexHostname(h)) return h;
  return `live.${h}`;
}

/** Registrars expect only the left-most Host label (never the full domain). */
export function expectsRelativeHostLabel() {
  return true;
}

/** TXT Host relative to the DNS zone (usually the apex). */
export function txtHostLabel(host) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!h || isApexHostname(h)) return TXT_HOST_LABEL;
  return `${TXT_HOST_LABEL}.${h.split('.')[0]}`;
}

export function cnameHostLabel(host) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!h || isApexHostname(h)) return '@';
  return h.split('.')[0];
}

/**
 * Collapse any FQDN mistakenly stored as Host into the relative label.
 * Never returns the full domain name.
 */
export function toRelativeHostLabel(nameOrHost, zoneHost, type = 'TXT') {
  const raw = String(nameOrHost || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  const zone = String(zoneHost || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');

  if (!raw) {
    if (type === 'CNAME' || type === 'A') return cnameHostLabel(zone);
    return txtHostLabel(zone);
  }
  if (raw === '@') return '@';
  if (zone && raw === zone) {
    return isApexHostname(zone) ? '@' : cnameHostLabel(zone);
  }

  if (zone && raw.endsWith(`.${zone}`)) {
    const relative = raw.slice(0, -(zone.length + 1));
    if (!relative) return '@';
    // Keep underscore multi-label TXT hosts like _eventlive-verify.live
    if (type === 'TXT' && relative.startsWith('_')) return relative;
    return relative.includes('.') ? relative.split('.')[0] : relative;
  }

  if (raw.includes('.') && !raw.startsWith('_')) {
    if (isApexHostname(raw) && (!zone || raw === zone)) return '@';
    return raw.split('.')[0];
  }

  return raw;
}

function buildFallbackRecords(host, token, verification) {
  const v = verification || {};
  const txt = {
    type: 'TXT',
    host: toRelativeHostLabel(v?.host || v?.name || txtHostLabel(host), host, 'TXT'),
    value: token,
    ttl: v?.ttl ?? DEFAULT_TTL,
  };
  // Prefer the correct subdomain TXT host when server sent a short label only.
  if (!isApexHostname(host) && txt.host === TXT_HOST_LABEL) {
    txt.host = txtHostLabel(host);
  }

  if (isApexHostname(host)) {
    return [
      txt,
      {
        type: 'A',
        host: '@',
        value: v?.routing?.value || v?.cname?.value || VERCEL_A_IP,
        ttl: v?.routing?.ttl ?? v?.cname?.ttl ?? DEFAULT_TTL,
      },
    ];
  }

  return [
    txt,
    {
      type: 'CNAME',
      host: toRelativeHostLabel(v?.cname?.host || v?.cname?.name || cnameHostLabel(host), host, 'CNAME'),
      value: v?.cname?.value || CNAME_TARGET,
      ttl: v?.cname?.ttl ?? DEFAULT_TTL,
    },
  ];
}

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

  const apex = isApexHostname(domain.host);
  const routing = records.find((r) => r.type === 'A' || r.type === 'CNAME');
  const routingHost = routing?.host || (apex ? '@' : cnameHostLabel(domain.host));
  const routingType = routing?.type || (apex ? 'A' : 'CNAME');
  const routingValue = routing?.value || (apex ? VERCEL_A_IP : CNAME_TARGET);
  const liveHint = recommendedLiveHostname(domain.host);

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 ${className}`}>
      <p className="font-semibold text-slate-800">Add these DNS records at your domain registrar:</p>
      {!apex && (
        <p className="mt-1 text-slate-500">
          Keep your existing website on the <span className="font-medium text-slate-700">root domain</span>.
          Only the <span className="font-medium text-slate-700">live</span> subdomain should point to EventLivePro
          (CNAME → <code className="rounded bg-white px-1 ring-1 ring-slate-200">{CNAME_TARGET}</code>).
          Do not change the root A record.
        </p>
      )}
      {apex && (
        <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
          Root domains take over your existing website if pointed at EventLivePro. Prefer{' '}
          <code className="rounded bg-white px-1">{liveHint}</code> instead (use “Migrate to live subdomain”
          in Super Admin, or add that host).
        </div>
      )}
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

      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
        <p className="font-semibold text-slate-800">Registrar Guide</p>
        <p className="mt-1 text-slate-500">
          Most registrars want only the left-most Host label (they append your domain automatically).
          Never paste the full domain into Host / Name.
        </p>
        <ul className="mt-2 space-y-1 text-slate-700">
          {[
            { name: 'GoDaddy', hostField: 'Host' },
            { name: 'Hostinger', hostField: 'Host' },
            { name: 'Namecheap', hostField: 'Host' },
            { name: 'Cloudflare', hostField: 'Name' },
          ].map((r) => (
            <li key={r.name}>
              <span className="font-medium text-slate-900">{r.name}</span>
              {' → '}
              {r.hostField} = <code className="rounded bg-slate-100 px-1">{txtHostLabel(domain.host)}</code>
              {' / '}
              <code className="rounded bg-slate-100 px-1">{routingHost}</code>
              {apex ? (
                <>
                  {' '}
                  (<span className="font-mono">A</span> →{' '}
                  <code className="rounded bg-slate-100 px-1">{routingValue}</code>)
                </>
              ) : (
                <>
                  {' '}
                  (<span className="font-mono">{routingType}</span> →{' '}
                  <code className="rounded bg-slate-100 px-1">{routingValue}</code>)
                </>
              )}
            </li>
          ))}
          <li>
            <span className="font-medium text-slate-900">Other registrars</span>
            {' → '}
            Host / Name = <code className="rounded bg-slate-100 px-1">{txtHostLabel(domain.host)}</code>
            {' / '}
            <code className="rounded bg-slate-100 px-1">{routingHost}</code>
            {apex ? ' (use @ or leave blank for the root A record)' : ''}
          </li>
        </ul>
      </div>

      <p className="mt-2 text-slate-500">
        After saving DNS, wait a few minutes for propagation, then click Verify.
      </p>
    </div>
  );
}

export function resolveDnsRecords(domain) {
  const host = String(domain?.host || '')
    .trim()
    .toLowerCase();
  const v = domain?.verification;
  const token = String(v?.value || domain?.verifyToken || '').trim();

  if (Array.isArray(v?.records) && v.records.length > 0) {
    const normalized = v.records.map((r) => {
      const type = String(r.type || 'TXT').toUpperCase();
      let relative = toRelativeHostLabel(r.host || r.name || '', host, type);
      if (type === 'TXT' && (relative === TXT_HOST_LABEL || !relative)) {
        relative = txtHostLabel(host);
      }
      let value = r.value || '';
      if (!value) {
        if (type === 'A') value = VERCEL_A_IP;
        else if (type === 'CNAME') value = CNAME_TARGET;
        else value = token;
      }
      return {
        type,
        host:
          type === 'TXT'
            ? relative.startsWith('_')
              ? relative
              : txtHostLabel(host)
            : relative || (type === 'A' ? '@' : cnameHostLabel(host)),
        value,
        ttl: r.ttl ?? DEFAULT_TTL,
      };
    });

    // Guard: never show CNAME for apex even if an old payload still has one.
    if (isApexHostname(host)) {
      const withoutCname = normalized.filter((r) => r.type !== 'CNAME');
      const hasA = withoutCname.some((r) => r.type === 'A');
      if (!hasA) {
        withoutCname.push({ type: 'A', host: '@', value: VERCEL_A_IP, ttl: DEFAULT_TTL });
      }
      return withoutCname.map((r) =>
        r.type === 'A' ? { ...r, host: '@', value: r.value || VERCEL_A_IP } : r
      );
    }

    return normalized;
  }

  if (!host || !token) return [];
  return buildFallbackRecords(host, token, v);
}
