/**
 * Premium Server Live — HLS playback via stream.eventlivepro.com (HTTPS).
 * Never use the VPS IP or :8888 in the browser.
 */
const HLS_PLAYBACK_BASE = (
  import.meta.env.VITE_HLS_PLAYBACK_BASE || 'https://stream.eventlivepro.com'
).replace(/\/+$/, '');

/** Build HLS manifest URL: https://stream.eventlivepro.com/live/{streamKey}/index.m3u8 */
export function buildServerHlsUrl(streamKey) {
  const key = String(streamKey || '').trim();
  if (!key) return '';
  return `${HLS_PLAYBACK_BASE}/live/${key}/index.m3u8`;
}

/**
 * Resolve Premium Server Live playback URL from stream config.
 * Stream key = MongoDB event id (config.eventId), or key parsed from a stored URL.
 */
export function resolveServerPlaybackUrl(config) {
  if (!config) return '';

  const fromStored = String(config.playbackUrl || config.hlsUrl || '').match(
    /\/live\/([^/]+)(?:\/index\.m3u8)?\/?/i
  );
  const streamKey = String(
    config.streamKey || config.eventId || config.id || (fromStored ? fromStored[1] : '') || ''
  ).trim();

  return buildServerHlsUrl(streamKey);
}

/**
 * Upgrade any legacy http://IP:8888 (or other host) HLS URL to the HTTPS domain.
 */
export function securePlaybackUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith(`${HLS_PLAYBACK_BASE}/`)) return trimmed;

  const pathMatch = trimmed.match(/(\/live\/[^/]+\/index\.m3u8)$/i);
  if (pathMatch) return `${HLS_PLAYBACK_BASE}${pathMatch[1]}`;

  const keyMatch = trimmed.match(/\/live\/([^/]+)/i);
  if (keyMatch) return buildServerHlsUrl(keyMatch[1]);

  return trimmed;
}
