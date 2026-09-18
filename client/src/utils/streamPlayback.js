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

export function isCloudflareStreamHlsUrl(url) {
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

/**
 * Cloudflare Stream Live DVR is opt-in on the manifest URL.
 * Idempotent; preserves other query params. MediaMTX URLs are never passed here.
 */
export function withCloudflareLiveDvr(hlsUrl) {
  const raw = String(hlsUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set('dvrEnabled', 'true');
    return parsed.toString();
  } catch {
    if (/(?:^|[?&])dvrEnabled=true(?:&|#|$)/.test(raw)) return raw;
    const hashIdx = raw.indexOf('#');
    const beforeHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
    const hash = hashIdx >= 0 ? raw.slice(hashIdx) : '';
    const joiner = beforeHash.includes('?') ? '&' : '?';
    return `${beforeHash}${joiner}dvrEnabled=true${hash}`;
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
  if (isCloudflareStreamHlsUrl(serverUrl)) {
    const videoUid = String(config.cfStreamVideoUid || '').trim();
    const liveInputId = String(config.cfStreamLiveInputId || '').trim();
    if (isFiniteCloudflareVodUrl(serverUrl, { videoUid, liveInputId })) {
      return stripCloudflareLiveDvrParam(serverUrl);
    }
    return withCloudflareLiveDvr(serverUrl);
  }
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
 * Cloudflare Stream VOD HLS for recorded playback.
 * Does not rewrite MediaMTX recordingUrl / MP4 parts.
 */
export function isCloudflareLiveDvrPlaybackUrl(url, liveInputId = '') {
  const raw = String(url || '').trim();
  if (!raw || !isCloudflareStreamHlsUrl(raw)) return false;
  const pathUid = cloudflareManifestUid(raw);
  const inputId = String(liveInputId || '').trim();
  // A Video UID manifest is never Live Input DVR, even if dvrEnabled was appended.
  if (pathUid && inputId && pathUid !== inputId) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.searchParams.get('dvrEnabled') === 'true') return true;
    return Boolean(inputId && pathUid && pathUid === inputId);
  } catch {
    return /[?&]dvrEnabled=true(?:&|#|$)/.test(raw);
  }
}

function cloudflareUrlHasUid(url, uid) {
  const id = String(uid || '').trim();
  if (!id) return false;
  try {
    return new URL(String(url || '')).pathname.includes(id);
  } catch {
    return String(url || '').includes(id);
  }
}

/** UID in `/<uid>/manifest/video.m3u8` — Live Input and Video UIDs share this shape. */
export function cloudflareManifestUid(url) {
  try {
    const parts = new URL(String(url || '').trim()).pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('manifest');
    if (idx > 0) return parts[idx - 1] || '';
    return '';
  } catch {
    return '';
  }
}

export function stripCloudflareLiveDvrParam(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('dvrEnabled');
    return parsed.toString();
  } catch {
    return raw
      .replace(/([?&])dvrEnabled=true(?=&|#|$)/g, (match, joiner) => (joiner === '?' ? '?' : ''))
      .replace(/\?&/, '?')
      .replace(/\?$/, '')
      .replace(/&&+/g, '&');
  }
}

/** Finite Cloudflare Video UID HLS — never the Live Input DVR playlist. */
export function isFiniteCloudflareVodUrl(url, { videoUid = '', liveInputId = '' } = {}) {
  const raw = String(url || '').trim();
  if (!raw || !isCloudflareStreamHlsUrl(raw)) return false;
  const pathUid = cloudflareManifestUid(raw);
  const inputId = String(liveInputId || '').trim();
  const vodUid = String(videoUid || '').trim();
  if (!pathUid || !vodUid) return false;
  if (inputId && (pathUid === inputId || vodUid === inputId)) return false;
  return pathUid === vodUid || cloudflareUrlHasUid(raw, vodUid);
}

export function resolveCloudflareRecordedHlsUrl(config) {
  if (!config) return '';
  if (config.isPublishing === true) return '';
  if (String(config.recordingUrl || '').trim()) return '';
  const videoUid = String(config.cfStreamVideoUid || '').trim();
  const liveInputId = String(config.cfStreamLiveInputId || '').trim();
  const candidates = [
    config.cfStreamPlaybackHlsUrl,
    config.playbackUrl,
    config.hlsUrl,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const url of candidates) {
    if (
      isFiniteCloudflareVodUrl(url, { videoUid, liveInputId }) ||
      (config.playbackMode === 'recorded' &&
        isCloudflareStreamHlsUrl(url) &&
        !isCloudflareLiveDvrPlaybackUrl(url, liveInputId) &&
        (!videoUid || cloudflareUrlHasUid(url, videoUid)) &&
        !(videoUid && liveInputId && videoUid === liveInputId))
    ) {
      if (!isCloudflareStreamHlsUrl(url)) continue;
      if (isCloudflareLiveDvrPlaybackUrl(url, liveInputId)) continue;
      if (videoUid && liveInputId && videoUid === liveInputId) continue;
      if (videoUid && !cloudflareUrlHasUid(url, videoUid)) continue;
      return stripCloudflareLiveDvrParam(url);
    }
  }
  return '';
}

/** Live Input DVR URL while OBS is publishing. Never returns a finite VOD UID. */
export function resolveCloudflareLiveDvrUrl(config) {
  if (!config) return '';
  const liveInputId = String(config.cfStreamLiveInputId || '').trim();
  const raw = String(config.playbackUrl || config.hlsUrl || '').trim();
  if (liveInputId && isCloudflareStreamHlsUrl(raw)) {
    const pathUid = cloudflareManifestUid(raw);
    if (pathUid && pathUid !== liveInputId) {
      try {
        const parsed = new URL(raw);
        parsed.pathname = parsed.pathname.split(pathUid).join(liveInputId);
        return withCloudflareLiveDvr(parsed.toString());
      } catch {
        /* fall through */
      }
    }
  }
  const resolved = resolveServerPlaybackUrl(config);
  if (isFiniteCloudflareVodUrl(resolved, {
    videoUid: config.cfStreamVideoUid,
    liveInputId,
  })) {
    return '';
  }
  return resolved;
}

/**
 * Upgrade any legacy http://IP:8888 (or other host) HLS URL to the active HTTPS base.
 */
export function securePlaybackUrl(url, config = null) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (isCloudflareStreamHlsUrl(trimmed)) {
    const videoUid = String(config?.cfStreamVideoUid || '').trim();
    const liveInputId = String(config?.cfStreamLiveInputId || '').trim();
    if (isFiniteCloudflareVodUrl(trimmed, { videoUid, liveInputId })) {
      return stripCloudflareLiveDvrParam(trimmed);
    }
    return withCloudflareLiveDvr(trimmed);
  }

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
