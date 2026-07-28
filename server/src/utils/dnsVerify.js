import dns from 'dns';
import { promisify } from 'util';
import {
  CNAME_TARGET,
  VERCEL_A_IP,
  isApexHostname,
  txtLookupName,
  TXT_HOST_LABEL,
  sanitizeHostname,
} from './dnsRecords.js';

const resolveNs = promisify(dns.resolveNs);
const resolve4 = promisify(dns.resolve4);

/** Public recursive resolvers (UDP). */
const PUBLIC_DNS_SERVERS = ['8.8.8.8', '1.1.1.1', '9.9.9.9'];

const REASON = {
  TXT_NOT_FOUND: 'TXT record not found',
  TXT_MISMATCH: 'TXT value mismatch',
  CNAME_MISSING: 'CNAME missing',
  A_MISSING: 'A record missing',
  PROPAGATION: 'DNS propagation pending',
  SSL_PENDING: 'SSL pending',
  NETWORK: 'Network error',
};

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

function logDns(...args) {
  // eslint-disable-next-line no-console
  console.log('[dnsVerify]', ...args);
}

/** Registrable / apex zone — never walk into TLD NS (co.in, com, …). */
export function getRegistrableDomain(host) {
  const h = sanitizeHostname(host);
  const parts = h.split('.').filter(Boolean);
  if (parts.length < 2) return h;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.length >= 3 ? parts.slice(-3).join('.') : h;
  }
  return parts.slice(-2).join('.');
}

function normalizeTxtValue(value) {
  return String(value || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .trim();
}

function isNotFoundError(err) {
  const code = err?.code || '';
  return code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN';
}

function isTransientDnsError(err) {
  const code = err?.code || '';
  return (
    code === 'ETIMEOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ESERVFAIL' ||
    code === 'EREFUSED' ||
    code === 'EFORMERR' ||
    code === 'ECONNRESET' ||
    code === 'EAI_AGAIN'
  );
}

/**
 * Resolve NS only for the domain's own zone (hostname and/or registrable apex).
 * Never uses parent TLD nameservers — those caused false "TXT record not found".
 */
async function getAuthoritativeResolver(hostname) {
  const registrable = getRegistrableDomain(hostname);
  const candidates = [];
  for (const zone of [hostname, registrable]) {
    if (zone && !candidates.includes(zone)) candidates.push(zone);
  }

  for (const zone of candidates) {
    try {
      const nsHosts = await resolveNs(zone);
      if (!nsHosts?.length) continue;

      const ips = [];
      for (const ns of nsHosts.slice(0, 6)) {
        try {
          const addrs = await resolve4(ns);
          for (const ip of addrs) {
            if (!ips.includes(ip)) ips.push(ip);
          }
        } catch {
          /* skip unreachable NS hostnames */
        }
      }
      if (!ips.length) {
        logDns('authoritative NS hosts had no A records', { zone, nsHosts });
        continue;
      }

      const resolver = new dns.Resolver();
      resolver.setServers(ips.slice(0, 3));
      logDns('using authoritative nameservers', { zone, nsHosts, ips: ips.slice(0, 3) });
      return { resolver, zone, nsHosts, ips: ips.slice(0, 3), authoritative: true };
    } catch (err) {
      logDns('resolveNs failed for zone', { zone, code: err?.code, message: err?.message });
    }
  }

  logDns('no authoritative resolver; will use public/system/DoH DNS', { hostname, registrable });
  return { resolver: null, zone: null, authoritative: false };
}

function makeResolver(servers) {
  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  return resolver;
}

function resolverCall(resolver, method, name) {
  return new Promise((resolve, reject) => {
    if (resolver && typeof resolver[method] === 'function') {
      resolver[method](name, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
      return;
    }
    dns.promises[method](name).then(resolve, reject);
  });
}

async function lookupTxtOn(resolver, name, source) {
  try {
    const records = await resolverCall(resolver, 'resolveTxt', name);
    const flat = (records || []).map((chunks) =>
      normalizeTxtValue(Array.isArray(chunks) ? chunks.join('') : String(chunks))
    );
    logDns('TXT lookup result', { source, queriedHostname: name, found: flat });
    return { ok: true, found: flat, error: null, source };
  } catch (err) {
    logDns('TXT lookup error', {
      source,
      queriedHostname: name,
      code: err?.code,
      message: err?.message,
    });
    return { ok: false, found: [], error: err, source };
  }
}

async function lookupAOn(resolver, name, source) {
  try {
    const records = await resolverCall(resolver, 'resolve4', name);
    logDns('A lookup result', { source, queriedHostname: name, found: records || [] });
    return { ok: true, found: records || [], error: null, source };
  } catch (err) {
    logDns('A lookup error', {
      source,
      queriedHostname: name,
      code: err?.code,
      message: err?.message,
    });
    return { ok: false, found: [], error: err, source };
  }
}

async function lookupCnameOn(resolver, name, source) {
  try {
    const records = await resolverCall(resolver, 'resolveCname', name);
    const flat = (records || []).map((r) => String(r).replace(/\.$/, '').toLowerCase());
    logDns('CNAME lookup result', { source, queriedHostname: name, found: flat });
    return { ok: true, found: flat, error: null, source };
  } catch (err) {
    logDns('CNAME lookup error', {
      source,
      queriedHostname: name,
      code: err?.code,
      message: err?.message,
    });
    return { ok: false, found: [], error: err, source };
  }
}

/**
 * DNS-over-HTTPS fallback (Google + Cloudflare). Helps when UDP/53 is blocked
 * on the host, and gives an independent view of public DNS.
 */
async function lookupTxtDoh(name, source, urlBuilder) {
  try {
    const url = urlBuilder(name);
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = new Error(`DoH HTTP ${res.status}`);
      err.code = 'ESERVFAIL';
      logDns('TXT DoH error', { source, queriedHostname: name, code: err.code, status: res.status });
      return { ok: false, found: [], error: err, source };
    }
    const data = await res.json();
    // Status 0 = NOERROR, 3 = NXDOMAIN
    if (data.Status === 3) {
      const err = new Error(`DoH NXDOMAIN ${name}`);
      err.code = 'ENOTFOUND';
      logDns('TXT DoH NXDOMAIN', { source, queriedHostname: name, status: data.Status });
      return { ok: false, found: [], error: err, source };
    }
    if (data.Status && data.Status !== 0) {
      const err = new Error(`DoH status ${data.Status}`);
      err.code = data.Status === 2 ? 'ESERVFAIL' : 'ENODATA';
      logDns('TXT DoH status', { source, queriedHostname: name, status: data.Status });
      return { ok: false, found: [], error: err, source };
    }
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    const flat = answers
      .filter((a) => a.type === 16 || String(a.type).toUpperCase() === 'TXT')
      .map((a) => normalizeTxtValue(String(a.data || '').replace(/^"|"$/g, '')));
    logDns('TXT DoH result', { source, queriedHostname: name, found: flat, status: data.Status });
    return { ok: flat.length > 0, found: flat, error: flat.length ? null : Object.assign(new Error('no TXT'), { code: 'ENODATA' }), source };
  } catch (err) {
    const wrapped = err?.name === 'TimeoutError' ? Object.assign(err, { code: 'ETIMEOUT' }) : err;
    logDns('TXT DoH error', {
      source,
      queriedHostname: name,
      code: wrapped?.code,
      message: wrapped?.message,
    });
    return { ok: false, found: [], error: wrapped, source };
  }
}

async function lookupADoh(name, source, urlBuilder) {
  try {
    const url = urlBuilder(name);
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = new Error(`DoH HTTP ${res.status}`);
      err.code = 'ESERVFAIL';
      return { ok: false, found: [], error: err, source };
    }
    const data = await res.json();
    if (data.Status === 3) {
      const err = new Error(`DoH NXDOMAIN ${name}`);
      err.code = 'ENOTFOUND';
      logDns('A DoH NXDOMAIN', { source, queriedHostname: name });
      return { ok: false, found: [], error: err, source };
    }
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    const flat = answers
      .filter((a) => a.type === 1 || String(a.type).toUpperCase() === 'A')
      .map((a) => String(a.data || '').trim())
      .filter(Boolean);
    logDns('A DoH result', { source, queriedHostname: name, found: flat });
    return {
      ok: flat.length > 0,
      found: flat,
      error: flat.length ? null : Object.assign(new Error('no A'), { code: 'ENODATA' }),
      source,
    };
  } catch (err) {
    return { ok: false, found: [], error: err, source };
  }
}

async function lookupCnameDoh(name, source, urlBuilder) {
  try {
    const url = urlBuilder(name);
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = new Error(`DoH HTTP ${res.status}`);
      err.code = 'ESERVFAIL';
      return { ok: false, found: [], error: err, source };
    }
    const data = await res.json();
    if (data.Status === 3) {
      const err = new Error(`DoH NXDOMAIN ${name}`);
      err.code = 'ENOTFOUND';
      return { ok: false, found: [], error: err, source };
    }
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    const flat = answers
      .filter((a) => a.type === 5 || String(a.type).toUpperCase() === 'CNAME')
      .map((a) => String(a.data || '').replace(/\.$/, '').toLowerCase())
      .filter(Boolean);
    logDns('CNAME DoH result', { source, queriedHostname: name, found: flat });
    return {
      ok: flat.length > 0,
      found: flat,
      error: flat.length ? null : Object.assign(new Error('no CNAME'), { code: 'ENODATA' }),
      source,
    };
  } catch (err) {
    return { ok: false, found: [], error: err, source };
  }
}

function googleDoh(type) {
  return (name) =>
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
}

function cloudflareDoh(type) {
  return (name) =>
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
}

function mergeFound(attempts) {
  const merged = [];
  for (const a of attempts) {
    if (!a.ok || !a.found?.length) continue;
    for (const v of a.found) {
      if (!merged.includes(v)) merged.push(v);
    }
  }
  return merged;
}

/**
 * Query authoritative first, then public UDP resolvers, system DNS, then DoH.
 */
async function lookupTxtMulti(auth, name) {
  const attempts = [];

  logDns('TXT query plan', {
    queriedHostname: name,
    expectedExact: `_eventlive-verify.<domain>`,
  });

  if (auth?.resolver) {
    attempts.push(await lookupTxtOn(auth.resolver, name, `authoritative:${auth.zone}`));
  }

  for (const server of PUBLIC_DNS_SERVERS) {
    attempts.push(await lookupTxtOn(makeResolver([server]), name, `udp:${server}`));
  }

  attempts.push(await lookupTxtOn(null, name, 'system'));
  attempts.push(await lookupTxtDoh(name, 'doh:google', googleDoh('TXT')));
  attempts.push(await lookupTxtDoh(name, 'doh:cloudflare', cloudflareDoh('TXT')));

  const successes = attempts.filter((a) => a.ok && a.found.length > 0);
  const networkErrors = attempts.filter((a) => !a.ok && isTransientDnsError(a.error));
  const notFound = attempts.filter((a) => !a.ok && isNotFoundError(a.error));
  const merged = mergeFound(attempts);

  logDns('TXT records by resolver', {
    queriedHostname: name,
    bySource: attempts.map((a) => ({
      source: a.source,
      ok: a.ok,
      found: a.found,
      code: a.error?.code || null,
    })),
    merged,
  });

  return { attempts, successes, networkErrors, notFound, merged };
}

async function lookupAMulti(auth, name) {
  const attempts = [];
  if (auth?.resolver) {
    attempts.push(await lookupAOn(auth.resolver, name, `authoritative:${auth.zone}`));
  }
  for (const server of PUBLIC_DNS_SERVERS) {
    attempts.push(await lookupAOn(makeResolver([server]), name, `udp:${server}`));
  }
  attempts.push(await lookupAOn(null, name, 'system'));
  attempts.push(await lookupADoh(name, 'doh:google', googleDoh('A')));
  attempts.push(await lookupADoh(name, 'doh:cloudflare', cloudflareDoh('A')));
  return { attempts, successes: attempts.filter((a) => a.ok && a.found.length > 0), merged: mergeFound(attempts) };
}

async function lookupCnameMulti(auth, name) {
  const attempts = [];
  if (auth?.resolver) {
    attempts.push(await lookupCnameOn(auth.resolver, name, `authoritative:${auth.zone}`));
  }
  for (const server of PUBLIC_DNS_SERVERS) {
    attempts.push(await lookupCnameOn(makeResolver([server]), name, `udp:${server}`));
  }
  attempts.push(await lookupCnameOn(null, name, 'system'));
  attempts.push(await lookupCnameDoh(name, 'doh:google', googleDoh('CNAME')));
  attempts.push(await lookupCnameDoh(name, 'doh:cloudflare', cloudflareDoh('CNAME')));
  return { attempts, successes: attempts.filter((a) => a.ok && a.found.length > 0), merged: mergeFound(attempts) };
}

function cnamePointsToTarget(found) {
  const target = CNAME_TARGET.toLowerCase();
  return found.some((v) => {
    const n = String(v).replace(/\.$/, '').toLowerCase();
    return n === target || n.endsWith(`.${target}`);
  });
}

function tokenMatches(foundValues, expected) {
  const want = normalizeTxtValue(expected);
  return foundValues.some((v) => normalizeTxtValue(v) === want);
}

/**
 * Full DNS ownership check. Matching TXT from ANY of
 * Google / Cloudflare / Quad9 / system / DoH / authoritative → verification passes.
 */
export async function verifyDomainDns(host, token) {
  const hostname = sanitizeHostname(host);
  const expected = normalizeTxtValue(token);
  const txtName = txtLookupName(hostname);
  const apex = isApexHostname(hostname);

  // Hard guarantee for the GoDaddy / apex case the customer is debugging.
  if (txtName !== `${TXT_HOST_LABEL}.${hostname}`) {
    logDns('ERROR: malformed txtName', { hostname, txtName });
  }

  logDns('verify start', {
    rawHost: host,
    hostname,
    queriedHostname: txtName,
    expectedExactLookup: '_eventlive-verify.livestreamonline.co.in (example)',
    expectedToken: expected,
    apex,
    registrable: getRegistrableDomain(hostname),
  });

  let auth;
  try {
    auth = await getAuthoritativeResolver(hostname);
  } catch (err) {
    logDns('authoritative resolver setup failed', { message: err?.message });
    auth = { resolver: null, zone: null, authoritative: false };
  }

  const txtResult = await lookupTxtMulti(auth, txtName);

  // Compare every returned value against the expected token.
  const matchingSources = txtResult.successes.filter((a) => tokenMatches(a.found, expected));
  logDns('TXT token comparison', {
    queriedHostname: txtName,
    expectedToken: expected,
    mergedFound: txtResult.merged,
    match: matchingSources.map((s) => s.source),
    mismatchOnly: txtResult.merged.length > 0 && matchingSources.length === 0,
  });

  if (matchingSources.length > 0) {
    // Requirement: if any public/system resolver returns the correct TXT, verification passes.
    const reasons = [];
    let routing = { ok: true, found: [], type: apex ? 'A' : 'CNAME' };

    if (apex) {
      const aResult = await lookupAMulti(auth, hostname);
      logDns('A summary', { queriedHostname: hostname, merged: aResult.merged });
      routing = { ok: aResult.merged.includes(VERCEL_A_IP), found: aResult.merged, type: 'A' };
      if (!routing.ok) reasons.push(REASON.A_MISSING);
    } else {
      const cnameResult = await lookupCnameMulti(auth, hostname);
      logDns('CNAME summary', { queriedHostname: hostname, merged: cnameResult.merged });
      routing = {
        ok: cnamePointsToTarget(cnameResult.merged),
        found: cnameResult.merged,
        type: 'CNAME',
      };
      if (!routing.ok) reasons.push(REASON.CNAME_MISSING);
    }

    const result = {
      ok: true,
      reason: reasons[0] || null,
      reasons,
      message: routing.ok
        ? 'DNS verified'
        : `TXT verified. Routing ${routing.type} still missing (${reasons[0]}), but ownership TXT matched so verification passes.`,
      authoritative: Boolean(auth?.authoritative),
      lookedUp: txtName,
      expected,
      found: txtResult.merged,
      txtMatched: true,
      matchingSources: matchingSources.map((s) => s.source),
      debug: {
        queriedHostname: txtName,
        hostname,
        expectedToken: expected,
        txtAttempts: summarizeAttempts(txtResult.attempts),
        routing,
      },
      txt: { ok: true, found: txtResult.merged, lookedUp: txtName },
      cname: {
        ok: routing.ok,
        found: routing.type === 'A' ? routing.found.map((ip) => `A ${ip}`) : routing.found,
        lookedUp: hostname,
      },
    };
    logDns('dnsCheck (success)', JSON.stringify(result, null, 2));
    return result;
  }

  // No matching TXT from any resolver.
  if (txtResult.merged.length > 0) {
    const result = {
      ok: false,
      reason: REASON.TXT_MISMATCH,
      reasons: [REASON.TXT_MISMATCH],
      message: `TXT value mismatch at ${txtName}. Queried hostname: ${txtName}. Returned records: ${txtResult.merged.join(' | ')}. Expected: ${expected}`,
      authoritative: Boolean(auth?.authoritative),
      lookedUp: txtName,
      expected,
      found: txtResult.merged,
      txtMatched: false,
      debug: {
        queriedHostname: txtName,
        hostname,
        expectedToken: expected,
        txtAttempts: summarizeAttempts(txtResult.attempts),
      },
      txt: { ok: false, found: txtResult.merged, lookedUp: txtName },
      cname: { ok: false, found: [], lookedUp: hostname },
    };
    logDns('dnsCheck (mismatch)', JSON.stringify(result, null, 2));
    return result;
  }

  const allNetwork =
    txtResult.attempts.length > 0 &&
    txtResult.networkErrors.length === txtResult.attempts.length;
  const someNetwork = txtResult.networkErrors.length > 0;

  if (allNetwork) {
    const result = {
      ok: false,
      reason: REASON.NETWORK,
      reasons: [REASON.NETWORK],
      message: `Network error looking up TXT ${txtName}. Queried hostname: ${txtName}.`,
      authoritative: Boolean(auth?.authoritative),
      lookedUp: txtName,
      expected,
      found: [],
      txtMatched: false,
      debug: {
        queriedHostname: txtName,
        hostname,
        expectedToken: expected,
        txtAttempts: summarizeAttempts(txtResult.attempts),
      },
      txt: { ok: false, found: [], lookedUp: txtName },
      cname: { ok: false, found: [], lookedUp: hostname },
    };
    logDns('dnsCheck (network)', JSON.stringify(result, null, 2));
    return result;
  }

  const result = {
    ok: false,
    reason: someNetwork ? REASON.PROPAGATION : REASON.TXT_NOT_FOUND,
    reasons: [someNetwork ? REASON.PROPAGATION : REASON.TXT_NOT_FOUND],
    message: someNetwork
      ? `DNS propagation pending for ${txtName}. Queried hostname: ${txtName}. Returned records: (none).`
      : `TXT record not found at ${txtName}. Queried hostname: ${txtName}. Returned records: (none). Ensure Host is "${TXT_HOST_LABEL}" (not the full domain) and that GoDaddy nameservers are active for the domain.`,
    authoritative: Boolean(auth?.authoritative),
    lookedUp: txtName,
    expected,
    found: [],
    txtMatched: false,
    debug: {
      queriedHostname: txtName,
      hostname,
      expectedToken: expected,
      txtAttempts: summarizeAttempts(txtResult.attempts),
    },
    txt: { ok: false, found: [], lookedUp: txtName },
    cname: { ok: false, found: [], lookedUp: hostname },
  };
  logDns('dnsCheck (not found)', JSON.stringify(result, null, 2));
  return result;
}

function summarizeAttempts(attempts) {
  return (attempts || []).map((a) => ({
    source: a.source,
    ok: a.ok,
    found: a.found,
    code: a.error?.code || null,
    message: a.error?.message || null,
  }));
}

/**
 * Backwards-compatible helper. Prefer {@link verifyDomainDns}.
 */
export async function checkDnsTxt(host, token) {
  const result = await verifyDomainDns(host, token);
  return {
    ok: result.ok,
    found: result.found || result.txt?.found || [],
    reason: result.reason,
    message: result.message,
    ...result,
  };
}

export { REASON as DNS_VERIFY_REASON };
