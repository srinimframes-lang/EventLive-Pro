/**
 * Ensure HLS playback URLs are HTTPS when the watch page is served over HTTPS.
 * Prevents mixed-content blocks on https://eventlivepro.com.
 */
const HTTPS_HLS_BASE = (
  import.meta.env.VITE_HLS_PLAYBACK_BASE || 'https://stream.eventlivepro.com'
).replace(/\/+$/, '');

export function securePlaybackUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('https://')) return trimmed;

  const onHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (!onHttps && !import.meta.env.PROD) return trimmed;

  if (trimmed.startsWith('http://')) {
    const pathMatch = trimmed.match(/(\/live\/[^/]+\/index\.m3u8)$/);
    if (pathMatch) return `${HTTPS_HLS_BASE}${pathMatch[1]}`;
    return trimmed.replace(/^http:\/\/[^/]+/, HTTPS_HLS_BASE);
  }

  return trimmed;
}
