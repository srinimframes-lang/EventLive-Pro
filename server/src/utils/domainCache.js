import { Domain } from '../models/Domain.js';

/**
 * In-memory cache of active custom-domain origins, used by the CORS allow-list
 * so requests from approved white-label domains are accepted without a DB hit
 * on every request. Refreshed periodically and on demand after mutations.
 */
let activeOrigins = new Set();
let refreshing = null;

export async function refreshDomainCache() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const docs = await Domain.find({ status: 'active' }).select('host').lean();
      const next = new Set();
      for (const d of docs) {
        next.add(`https://${d.host}`);
        next.add(`http://${d.host}`);
      }
      activeOrigins = next;
    } catch {
      /* keep the previous snapshot on transient errors */
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function isActiveDomainOrigin(origin) {
  return activeOrigins.has(origin);
}

export function getActiveOriginCount() {
  return activeOrigins.size;
}

/** Starts a background refresh loop (returns the interval handle). */
export function startDomainCache(intervalMs = 60_000) {
  refreshDomainCache();
  const handle = setInterval(refreshDomainCache, intervalMs);
  if (handle.unref) handle.unref();
  return handle;
}
