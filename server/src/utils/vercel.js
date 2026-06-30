import { env } from '../config/env.js';

const API = 'https://api.vercel.com';

function teamQuery() {
  return env.vercel.teamId ? `?teamId=${encodeURIComponent(env.vercel.teamId)}` : '';
}

async function vercelFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.vercel.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

/** Normalises Vercel's `verification` challenge array into a simple shape. */
function mapVerification(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => ({
    type: v.type || 'TXT',
    domain: v.domain || '',
    value: v.value || '',
    reason: v.reason || '',
  }));
}

/**
 * Attaches a domain to the configured Vercel project. Idempotent: a domain that
 * already exists returns ok. No-op (returns enabled:false) when the integration
 * is not configured.
 */
export async function attachDomain(host) {
  if (!env.vercel.enabled) return { enabled: false };
  const r = await vercelFetch(`/v10/projects/${env.vercel.projectId}/domains${teamQuery()}`, {
    method: 'POST',
    body: JSON.stringify({ name: host }),
  });
  // 409 = already added → treat as success.
  const ok = r.ok || r.status === 409;
  return {
    enabled: true,
    ok,
    status: r.status,
    verified: Boolean(r.data?.verified),
    verification: mapVerification(r.data?.verification),
    error: ok ? '' : r.data?.error?.message || `Vercel returned ${r.status}`,
    data: r.data,
  };
}

/** Removes a domain from the Vercel project (best-effort). */
export async function detachDomain(host) {
  if (!env.vercel.enabled) return { enabled: false };
  const r = await vercelFetch(
    `/v9/projects/${env.vercel.projectId}/domains/${encodeURIComponent(host)}${teamQuery()}`,
    { method: 'DELETE' }
  );
  return { enabled: true, ok: r.ok || r.status === 404, status: r.status };
}

/**
 * Reads a domain's config from Vercel to determine verification + SSL state.
 * Returns a normalised { verified, ssl, verification[] } summary.
 */
export async function getDomainStatus(host) {
  if (!env.vercel.enabled) return { enabled: false };
  const cfg = await vercelFetch(
    `/v6/domains/${encodeURIComponent(host)}/config${teamQuery()}`,
    { method: 'GET' }
  );
  const proj = await vercelFetch(
    `/v9/projects/${env.vercel.projectId}/domains/${encodeURIComponent(host)}${teamQuery()}`,
    { method: 'GET' }
  );
  const misconfigured = cfg.data?.misconfigured;
  const attached = proj.ok;
  const verified = proj.ok ? Boolean(proj.data?.verified) : false;
  // SSL is effectively issued by Vercel once DNS is correctly configured and the
  // domain is verified on the project.
  const ssl = verified && misconfigured === false ? 'issued' : 'pending';
  return {
    enabled: true,
    attached,
    verified,
    ssl,
    misconfigured,
    verification: mapVerification(proj.data?.verification),
    raw: { cfg: cfg.data, proj: proj.data },
  };
}
