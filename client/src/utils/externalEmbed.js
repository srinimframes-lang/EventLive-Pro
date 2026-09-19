/** HTTPS-only external embed helpers. Never execute caller HTML. */

export const STREAMING_PROVIDER_OPTIONS = [
  { id: 'cloudflare_stream', label: 'Cloudflare Stream' },
  { id: 'mux', label: 'Mux' },
  { id: 'external_embed', label: 'External Server Embed' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'mediamtx', label: 'Legacy MediaMTX' },
];

const BLOCKED_PROTOCOL = /^(javascript|data|blob|file|vbscript):/i;

export function normalizeStreamingProvider(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  return STREAMING_PROVIDER_OPTIONS.some((item) => item.id === raw) ? raw : '';
}

export function inferStreamingProvider(event = {}) {
  const stored = normalizeStreamingProvider(event.streamingProvider);
  if (stored) return stored;
  if (event.externalEmbedUrl || event.externalHlsUrl || event.externalEmbedHtml) {
    return 'external_embed';
  }
  if (String(event.liveIngestProvider || '') === 'cloudflare_stream') return 'cloudflare_stream';
  if (
    String(event.liveIngestProvider || '') === 'mediamtx' &&
    (event.streamProvider === 'rtmp' || event.streamProvider === 'hls')
  ) {
    return 'mediamtx';
  }
  if (event.streamProvider === 'youtube') return 'youtube';
  return '';
}

export function isExternalEmbedConfig(config = {}) {
  return (
    String(config.streamingProvider || '') === 'external_embed' ||
    String(config.viewerPlayback || '') === 'external_embed'
  );
}

export function extractIframeSrc(html) {
  const raw = String(html || '');
  if (!raw || /<script\b/i.test(raw) || /\bon[a-z]+\s*=/i.test(raw)) return '';
  const match = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  return match ? String(match[1] || '').trim() : '';
}

export function sanitizeHttpsUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed || BLOCKED_PROTOCOL.test(trimmed)) return '';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password) return '';
  if (!parsed.hostname) return '';
  return parsed.toString();
}

export function sanitizeHlsUrl(raw) {
  const url = sanitizeHttpsUrl(raw);
  if (!url) return '';
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  if (!path.endsWith('.m3u8') && !parsed.search.toLowerCase().includes('.m3u8')) return '';
  return url;
}

export function normalizeExternalEmbedType(value) {
  return String(value || '').trim().toLowerCase() === 'hls' ? 'hls' : 'iframe';
}

export function resolveExternalEmbedPlayback(input = {}) {
  const type = normalizeExternalEmbedType(input.externalEmbedType);
  const fromHtml = sanitizeHttpsUrl(extractIframeSrc(input.externalEmbedHtml));
  const embedUrl = sanitizeHttpsUrl(input.externalEmbedUrl) || fromHtml;
  const hlsUrl =
    sanitizeHlsUrl(input.externalHlsUrl) ||
    (type === 'hls' ? sanitizeHlsUrl(input.externalEmbedUrl) : '');
  if (type === 'hls') {
    return { type: 'hls', url: hlsUrl, valid: Boolean(hlsUrl) };
  }
  return { type: 'iframe', url: embedUrl, valid: Boolean(embedUrl) };
}

export function selectExternalEmbedPlayer(config = {}) {
  if (!isExternalEmbedConfig(config)) return null;
  const playback = resolveExternalEmbedPlayback(config);
  if (!playback.valid) return { mode: 'offline', type: playback.type, url: '' };
  return { mode: playback.type, type: playback.type, url: playback.url };
}

export function validateExternalEmbedForm(form = {}) {
  const playback = resolveExternalEmbedPlayback(form);
  if (!playback.valid) {
    return playback.type === 'hls'
      ? 'Enter a valid HTTPS HLS (.m3u8) URL.'
      : 'Enter a valid HTTPS embed URL or iframe src.';
  }
  return '';
}
