/**
 * Premium Server Live — HLS playback via HTTPS.
 * Prefer the API-provided playback URL so the Super Admin CDN toggle applies
 * without rebuilding the client. Never use the VPS IP or :8888 in the browser.
 *
 * CDN OFF → https://stream.eventlivepro.com/live/...
 * CDN ON  → https://cdn.eventlivepro.com/live/...
 * (Set by server; this module only falls back to origin when API omits URL.)
 */
const ORIGIN_HLS_PLAYBACK_BASE = (
  import.meta.env.VITE_HLS_PLAYBACK_BASE || 'https://stream.eventlivepro.com'
).replace(/\/+$/, '');

const CDN_HLS_PLAYBACK_BASE = (
  import.meta.env.VITE_HLS_CDN_PLAYBACK_BASE || 'https://cdn.eventlivepro.com'
).replace(/\/+$/, '');

function viewerBaseFromConfig(config) {
  const fromApi = String(config?.hlsPlaybackBase || '').trim().replace(/\/+$/, '');
  if (fromApi.startsWith('https://')) return fromApi;
  if (config?.hlsCdnEnabled) return CDN_HLS_PLAYBACK_BASE;
  return ORIGIN_HLS_PLAYBACK_BASE;
}

/** Build HLS manifest URL for a stream key using the active viewer base. */
export function buildServerHlsUrl(streamKey, config = null) {
  const key = String(streamKey || '').trim();
  if (!key) return '';
  const base = viewerBaseFromConfig(config);
  return `${base}/live/${key}/index.m3u8`;
}

/**
 * Resolve Premium Server Live playback URL from stream config.
 * Prefer server playbackUrl/hlsUrl (CDN-aware). Fall back to rebuilding from key.
 */
export function resolveServerPlaybackUrl(config) {
  if (!config) return '';

  const serverUrl = String(config.playbackUrl || config.hlsUrl || '').trim();
  if (/^https:\/\//i.test(serverUrl) && /\/live\/[^/]+\/index\.m3u8/i.test(serverUrl)) {
    return serverUrl;
  }

  const fromStored = serverUrl.match(/\/live\/([^/]+)(?:\/index\.m3u8)?\/?/i);
  const streamKey = String(
    config.streamKey || config.eventId || config.id || (fromStored ? fromStored[1] : '') || ''
  ).trim();

  return buildServerHlsUrl(streamKey, config);
}

/**
 * Upgrade any legacy http://IP:8888 (or other host) HLS URL to the active HTTPS base.
 */
export function securePlaybackUrl(url, config = null) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  const base = viewerBaseFromConfig(config);
  if (trimmed.startsWith(`${base}/`)) return trimmed;
  if (trimmed.startsWith(`${ORIGIN_HLS_PLAYBACK_BASE}/`) || trimmed.startsWith(`${CDN_HLS_PLAYBACK_BASE}/`)) {
    // Already on a known HTTPS playback host — leave as-is (server chose host).
    return trimmed;
  }

  const pathMatch = trimmed.match(/(\/live\/[^/]+\/index\.m3u8)$/i);
  if (pathMatch) return `${base}${pathMatch[1]}`;

  const keyMatch = trimmed.match(/\/live\/([^/]+)/i);
  if (keyMatch) return buildServerHlsUrl(keyMatch[1], config);

  return trimmed;
}
