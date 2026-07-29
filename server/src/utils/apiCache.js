/**
 * Tiny in-memory TTL cache for public, read-mostly API responses.
 * Does not touch MongoDB data. Process-local only (fine for single Render instance).
 */
const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs = 30_000) {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
  return value;
}

export function cacheDel(key) {
  store.delete(key);
}

export function cacheDelPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
