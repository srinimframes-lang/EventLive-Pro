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
  return { enabled: true, ok, status: r.status, data: r.data };
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
 * Returns a normalised { verified, ssl } summary.
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
  const verified = proj.ok ? Boolean(proj.data?.verified) : false;
  // SSL is effectively issued by Vercel once DNS is correctly configured.
  const ssl = misconfigured === false ? 'issued' : 'pending';
  return { enabled: true, verified, ssl, misconfigured, raw: { cfg: cfg.data, proj: proj.data } };
}
