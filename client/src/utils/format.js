export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Converts an ISO date string into the value format expected by
 * <input type="datetime-local"> (YYYY-MM-DDTHH:mm) in local time.
 */
export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Extracts a YouTube video ID from a full URL or returns the input if it
 * already looks like a bare ID. Supports watch?v=, youtu.be/, /live/,
 * /embed/ and /shorts/ formats. Returns '' when nothing usable is found.
 */
export function extractYouTubeId(input) {
  if (!input) return '';
  const value = String(input).trim();

  // Already a bare 11-char video id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return url.pathname.slice(1, 12);
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = url.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const match = url.pathname.match(/\/(?:live|embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    }
  } catch {
    // Not a URL — fall through.
  }

  // Last resort: pull any 11-char token out of the string.
  const loose = value.match(/[a-zA-Z0-9_-]{11}/);
  return loose ? loose[0] : '';
}

/**
 * Builds a shareable absolute URL for the in-app watch page of an event.
 */
export function buildWatchUrl(event) {
  if (typeof window === 'undefined' || !event) return '';
  const idOrSlug = event.slug || event.id;
  return `${window.location.origin}/events/${idOrSlug}/live`;
}

// Backend origin (VITE_API_URL with any trailing slash / `/api` suffix removed).
// In production this is the Render API; in dev it is empty so relative
// `/uploads/...` paths flow through the Vite proxy to the backend.
const MEDIA_ORIGIN = (import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

/**
 * Resolves a media URL for display. Uploaded files are stored as relative
 * `/uploads/...` paths that live on the backend, not the frontend origin —
 * so we prefix the backend origin. Absolute URLs (Cloudinary, Unsplash, etc.)
 * and data/blob URLs are returned unchanged.
 */
export function resolveMediaUrl(url) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/uploads')) return `${MEDIA_ORIGIN}${url}`;
  return url;
}
