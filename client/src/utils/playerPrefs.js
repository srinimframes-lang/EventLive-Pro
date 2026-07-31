/** Session playback position helpers (survive refresh within the tab session). */

function keyFor(eventId, kind, partId = '') {
  const id = String(eventId || '').trim() || 'unknown';
  if (kind === 'replay') return `elp-pos:replay:${id}:${partId || 'main'}`;
  return `elp-pos:live:${id}`;
}

export function loadPlaybackPosition(eventId, kind = 'live', partId = '') {
  try {
    const raw = sessionStorage.getItem(keyFor(eventId, kind, partId));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function savePlaybackPosition(eventId, seconds, kind = 'live', partId = '') {
  try {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 1) return;
    sessionStorage.setItem(keyFor(eventId, kind, partId), String(Math.floor(n)));
  } catch {
    /* private mode / quota */
  }
}

export function clearPlaybackPosition(eventId, kind = 'live', partId = '') {
  try {
    sessionStorage.removeItem(keyFor(eventId, kind, partId));
  } catch {
    /* ignore */
  }
}

/** True when the viewer already pressed Play this session for this event. */
export function loadUserStarted(eventId) {
  try {
    return sessionStorage.getItem(`elp-started:${String(eventId || '')}`) === '1';
  } catch {
    return false;
  }
}

export function saveUserStarted(eventId) {
  try {
    sessionStorage.setItem(`elp-started:${String(eventId || '')}`, '1');
  } catch {
    /* ignore */
  }
}
