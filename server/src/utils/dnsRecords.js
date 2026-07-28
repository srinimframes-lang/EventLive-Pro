/**
 * DNS instruction helpers for white-label custom domains.
 * Registrars (GoDaddy, Namecheap, Cloudflare, Hostinger, …) expect the
 * relative Host/Name label — never the full FQDN in the Host field.
 */

export const TXT_HOST_LABEL = '_eventlive-verify';
export const CNAME_TARGET = 'cname.vercel-dns.com';
export const VERCEL_A_IP = '76.76.21.21';
export const DNS_TTL_SECONDS = 3600;

/** Common multi-part public suffixes so apex detection works for .co.in etc. */
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

/**
 * True when `host` is an apex/root domain (e.g. example.com, livestreamonline.co.in),
 * not a subdomain (live.example.com).
 */
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

/** Host label for the ownership TXT record (always relative). */
export function txtHostLabel() {
  return TXT_HOST_LABEL;
}

/**
 * Host label for the routing record (A on apex, CNAME on subdomain):
 * - apex → `@`
 * - subdomain → left-most label only (e.g. `live`)
 */
export function cnameHostLabel(host) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!h || isApexHostname(h)) return '@';
  return h.split('.')[0];
}

/** Alias — same relative Host used for apex A and subdomain CNAME. */
export const routingHostLabel = cnameHostLabel;

/** Absolute name used for DNS lookups (not for registrar Host fields). */
export function sanitizeHostname(host) {
  let h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:.*$/, '')
    .replace(/\.$/, '');

  // Strip accidental ownership-label prefix if stored on the domain row.
  const prefix = `${TXT_HOST_LABEL}.`;
  while (h.startsWith(prefix)) {
    h = h.slice(prefix.length);
  }

  // Collapse duplicated zone: example.com.example.com → example.com
  const parts = h.split('.').filter(Boolean);
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const a = parts.slice(0, half).join('.');
    const b = parts.slice(half).join('.');
    if (a === b) h = a;
  }

  return h;
}

export function txtLookupName(host) {
  const h = sanitizeHostname(host);
  return `${TXT_HOST_LABEL}.${h}`;
}

/**
 * Strip a trailing zone suffix so we never show an FQDN in Host.
 * e.g. `_eventlive-verify.example.com` + zone `example.com` → `_eventlive-verify`
 */
export function toRelativeHostLabel(nameOrHost, zoneHost) {
  const raw = String(nameOrHost || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  const zone = String(zoneHost || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!raw) return '';
  if (raw === '@' || raw === zone) return isApexHostname(zone || raw) ? '@' : cnameHostLabel(zone || raw);
  if (zone && (raw === zone || raw.endsWith(`.${zone}`))) {
    const relative = raw === zone ? '@' : raw.slice(0, -(zone.length + 1));
    if (!relative || relative === '@') return '@';
    // Prefer left-most label only (registrars append the zone themselves).
    if (relative.includes('.')) return relative.split('.')[0];
    return relative;
  }
  // Already a short label, or unknown — never return a dotted FQDN that equals the zone.
  if (zone && raw.includes('.') && raw.endsWith(zone)) {
    return toRelativeHostLabel(raw, zone);
  }
  if (raw.includes('.') && !raw.startsWith('_')) {
    // Likely a mistaken full hostname; use left-most label.
    return raw.split('.')[0];
  }
  return raw;
}

/**
 * Recommended DNS records for the registrar UI (relative Host labels).
 * Apex/root domains cannot use CNAME on GoDaddy and most registrars — use A → Vercel.
 * Subdomains use CNAME → cname.vercel-dns.com.
 */
export function buildDnsInstructionRecords(host, token) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  const value = String(token || '').trim();
  const records = [
    {
      type: 'TXT',
      name: txtHostLabel(),
      host: txtHostLabel(),
      value,
      ttl: DNS_TTL_SECONDS,
    },
  ];

  if (isApexHostname(h)) {
    records.push({
      type: 'A',
      name: '@',
      host: '@',
      value: VERCEL_A_IP,
      ttl: DNS_TTL_SECONDS,
    });
  } else {
    records.push({
      type: 'CNAME',
      name: cnameHostLabel(h),
      host: cnameHostLabel(h),
      value: CNAME_TARGET,
      ttl: DNS_TTL_SECONDS,
    });
  }

  return records;
}
