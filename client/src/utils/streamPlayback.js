/**
 * Premium Server Live — HLS playback via HTTPS.
 * Prefer the API-provided playback URL so the Super Admin CDN toggle and
 * Adaptive Streaming (master.m3u8) apply without rebuilding the client.
 *
 * Adaptive ON  → .../live/{key}/master.m3u8 (Super Admin opt-in only)
 * Adaptive OFF (default) → .../live/{key}/index.m3u8
 * CDN OFF → https://stream.eventlivepro.com/live/...
 * CDN ON  → https://cdn.eventlivepro.com/live/...
 */
const ORIGIN_HLS_PLAYBACK_BASE = (
  import.meta.env?.VITE_HLS_PLAYBACK_BASE || 'https://stream.eventlivepro.com'
).replace(/\/+$/, '');

const CDN_HLS_PLAYBACK_BASE = (
  import.meta.env?.VITE_HLS_CDN_PLAYBACK_BASE || 'https://cdn.eventlivepro.com'
).replace(/\/+$/, '');

const HLS_PLAYLIST_RE = /\/live\/[^/]+\/(?:index|master)\.m3u8/i;
const CF_STREAM_MANIFEST_RE = /\/manifest\/video\.m3u8/i;

function isCloudflareStreamHlsUrl(url) {
  const trimmed = String(url || '').trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  if (CF_STREAM_MANIFEST_RE.test(trimmed)) return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host === 'cloudflarestream.com' || host.endsWith('.cloudflarestream.com');
  } catch {
    return false;
  }
}

function viewerBaseFromConfig(config) {
  const fromApi = String(config?.hlsPlaybackBase || '').trim().replace(/\/+$/, '');
  if (fromApi.startsWith('https://')) return fromApi;
  if (config?.hlsCdnEnabled) return CDN_HLS_PLAYBACK_BASE;
  return ORIGIN_HLS_PLAYBACK_BASE;
}

function playlistFromConfig(config) {
  // Explicit true → ABR master. Missing / false → single-quality MediaMTX index.
  if (config && config.adaptiveStreaming === true) return 'master.m3u8';
  return 'index.m3u8';
}

/** Build HLS manifest URL for a stream key using the active viewer base. */
export function buildServerHlsUrl(streamKey, config = null) {
  const key = String(streamKey || '').trim();
  if (!key) return '';
  const base = viewerBaseFromConfig(config);
  return `${base}/live/${key}/${playlistFromConfig(config)}`;
}

/**
 * Resolve Premium Server Live playback URL from stream config.
 * Prefer server playbackUrl/hlsUrl (CDN + ABR aware). Fall back to rebuilding from key.
 */
export function resolveServerPlaybackUrl(config) {
  if (!config) return '';

  const serverUrl = String(config.playbackUrl || config.hlsUrl || '').trim();
  if (isCloudflareStreamHlsUrl(serverUrl)) return serverUrl;
  if (/^https:\/\//i.test(serverUrl) && HLS_PLAYLIST_RE.test(serverUrl)) {
    return serverUrl;
  }

  const fromStored = serverUrl.match(/\/live\/([^/]+)(?:\/(?:index|master)\.m3u8)?\/?/i);
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
  if (isCloudflareStreamHlsUrl(trimmed)) return trimmed;

  const base = viewerBaseFromConfig(config);
  if (trimmed.startsWith(`${base}/`)) return trimmed;
  if (trimmed.startsWith(`${ORIGIN_HLS_PLAYBACK_BASE}/`) || trimmed.startsWith(`${CDN_HLS_PLAYBACK_BASE}/`)) {
    // Already on a known HTTPS playback host — leave as-is (server chose host).
    return trimmed;
  }

  const pathMatch = trimmed.match(/(\/live\/[^/]+\/(?:index|master)\.m3u8)$/i);
  if (pathMatch) return `${base}${pathMatch[1]}`;

  const keyMatch = trimmed.match(/\/live\/([^/]+)/i);
  if (keyMatch) return buildServerHlsUrl(keyMatch[1], config);

  return trimmed;
}
