/** HTTPS-only external embed helpers. Never execute caller HTML. */

export const STREAMING_PROVIDERS = [
  'cloudflare_stream',
  'mux',
  'external_embed',
  'youtube',
  'mediamtx',
];

const BLOCKED_PROTOCOL = /^(javascript|data|blob|file|vbscript):/i;
const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const IFRAME_HANDLER_ATTR = /\s+on[a-z]+\s*=/i;

export function normalizeStreamingProvider(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  return STREAMING_PROVIDERS.includes(raw) ? raw : '';
}

export function inferStreamingProvider(event = {}) {
  const stored = normalizeStreamingProvider(event.streamingProvider);
  if (stored) return stored;
  if (event.externalEmbedUrl || event.externalHlsUrl || event.externalEmbedHtml) {
    return 'external_embed';
  }
  if (event.muxLiveStreamId || event.muxPlaybackId) return 'mux';
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

export function isExternalEmbedEvent(event = {}) {
  return inferStreamingProvider(event) === 'external_embed';
}

export function extractIframeSrc(html) {
  const raw = String(html || '');
  if (!raw || /<script\b/i.test(raw) || IFRAME_HANDLER_ATTR.test(raw)) return '';
  const match = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  return match ? String(match[1] || '').trim() : '';
}

function youtubeHost(hostname) {
  return YOUTUBE_HOSTS.has(String(hostname || '').toLowerCase());
}

function youtubeVideoIdFromUrl(parsed) {
  if (!parsed || !youtubeHost(parsed.hostname)) return '';
  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    return YOUTUBE_VIDEO_ID_RE.test(parts[0] || '') ? parts[0] : '';
  }
  const fromPath = parsed.pathname.match(/\/(?:embed|live|shorts|v)\/([^/?#]+)/i);
  if (fromPath && YOUTUBE_VIDEO_ID_RE.test(fromPath[1])) return fromPath[1];
  const fromQuery = parsed.searchParams.get('v') || '';
  return YOUTUBE_VIDEO_ID_RE.test(fromQuery) ? fromQuery : '';
}

/** Turn watch / live / youtu.be / embed URLs into https://www.youtube.com/embed/ID. */
export function canonicalizeExternalIframeSrc(raw) {
  const https = sanitizeHttpsUrl(raw);
  if (!https) return '';
  let parsed;
  try {
    parsed = new URL(https);
  } catch {
    return '';
  }
  const id = youtubeVideoIdFromUrl(parsed);
  if (!id) return https;
  return `https://www.youtube.com/embed/${id}`;
}

export function isYouTubeIframeSrc(raw) {
  const src = String(raw || '').trim();
  if (!src) return false;
  try {
    return youtubeHost(new URL(src).hostname);
  } catch {
    return false;
  }
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

export function sanitizeIframeHtml(html) {
  const src = canonicalizeExternalIframeSrc(extractIframeSrc(html));
  return src ? `<iframe src="${src}"></iframe>` : '';
}

export function normalizeExternalEmbedType(value) {
  return String(value || '').trim().toLowerCase() === 'hls' ? 'hls' : 'iframe';
}

export function resolveExternalEmbedPlayback(input = {}) {
  const type = normalizeExternalEmbedType(input.externalEmbedType);
  const fromHtml = canonicalizeExternalIframeSrc(extractIframeSrc(input.externalEmbedHtml));
  const embedUrl = canonicalizeExternalIframeSrc(input.externalEmbedUrl) || fromHtml;
  const hlsUrl =
    sanitizeHlsUrl(input.externalHlsUrl) ||
    (type === 'hls' ? sanitizeHlsUrl(input.externalEmbedUrl) : '');
  if (type === 'hls') {
    return { type: 'hls', url: hlsUrl, valid: Boolean(hlsUrl) };
  }
  return { type: 'iframe', url: embedUrl, valid: Boolean(embedUrl) };
}

export function isMuxEvent(event = {}) {
  return inferStreamingProvider(event) === 'mux';
}

export function applyMuxFields(target) {
  target.streamingProvider = 'mux';
  target.streamProvider = 'none';
  target.streamingDestination = undefined;
  target.youtubeForwardEnabled = false;
  if (target.creditType !== 'none') target.creditType = 'none';
  return target;
}

export function applyExternalEmbedFields(target, body = {}) {
  const type = normalizeExternalEmbedType(body.externalEmbedType);
  const embedUrl =
    canonicalizeExternalIframeSrc(body.externalEmbedUrl) ||
    canonicalizeExternalIframeSrc(extractIframeSrc(body.externalEmbedHtml));
  const hlsUrl = sanitizeHlsUrl(body.externalHlsUrl);
  const html = sanitizeIframeHtml(body.externalEmbedHtml);
  target.streamingProvider = 'external_embed';
  target.streamProvider = 'none';
  target.streamingDestination = undefined;
  target.youtubeForwardEnabled = false;
  if (target.creditType !== 'none') target.creditType = 'none';
  target.externalEmbedType = type;
  target.externalEmbedUrl = embedUrl;
  target.externalHlsUrl = hlsUrl;
  target.externalEmbedHtml = html;
  return resolveExternalEmbedPlayback(target);
}

export function clearExternalEmbedFields(target) {
  target.externalEmbedUrl = '';
  target.externalEmbedHtml = '';
  target.externalHlsUrl = '';
  return target;
}

export function validateExternalEmbedPayload(body = {}) {
  const playback = resolveExternalEmbedPlayback(body);
  if (!playback.valid) {
    return playback.type === 'hls'
      ? 'A valid HTTPS HLS (.m3u8) URL is required for External Server Embed.'
      : 'A valid HTTPS embed URL or iframe src is required for External Server Embed.';
  }
  return null;
}
