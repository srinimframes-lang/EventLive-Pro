/**
 * Extracts a YouTube video ID from a full URL or bare ID.
 * Mirrors client/src/utils/format.js — keep in sync.
 */
export function extractYouTubeId(input) {
  if (!input) return '';
  const value = String(input).trim();
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
    // Not a URL.
  }

  const loose = value.match(/[a-zA-Z0-9_-]{11}/);
  return loose ? loose[0] : '';
}
