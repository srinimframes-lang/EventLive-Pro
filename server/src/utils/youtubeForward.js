/**
 * YouTube RTMP forward helpers for Server + YouTube simultaneous streaming.
 * Keys are never logged; callers must keep select:false fields private.
 */

const DEFAULT_YOUTUBE_RTMP = 'rtmp://a.rtmp.youtube.com/live2';

/** Normalize destination from request body or stored event. */
export function normalizeStreamingDestination(raw) {
  const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (v === 'server' || v === 'server_only') return 'server';
  if (v === 'youtube' || v === 'youtube_only') return 'youtube';
  if (v === 'server_youtube' || v === 'server+youtube' || v === 'simultaneous') {
    return 'server_youtube';
  }
  if (v === 'youtube_server' || v === 'youtube+server') {
    return 'youtube_server';
  }
  return null;
}

/**
 * Validate a YouTube RTMP ingest URL (scheme + host). Allows trailing path.
 * Returns normalized URL without trailing slash, or '' if empty.
 */
export function normalizeYoutubeRtmpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'rtmp:' && url.protocol !== 'rtmps:') return null;
  if (!url.hostname) return null;
  // Strip accidental stream key pasted into the URL path beyond /live2
  const path = url.pathname.replace(/\/+$/, '') || '';
  return `${url.protocol}//${url.host}${path}`;
}

/** YouTube stream keys are opaque; allow common safe charset, length 6–128. */
export function normalizeYoutubeStreamKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.length < 6 || value.length > 128) return null;
  if (!/^[A-Za-z0-9._\-]+$/.test(value)) return null;
  return value;
}

export function buildYoutubeForwardTarget(rtmpUrl, streamKey) {
  const base = normalizeYoutubeRtmpUrl(rtmpUrl) || DEFAULT_YOUTUBE_RTMP;
  const key = normalizeYoutubeStreamKey(streamKey);
  if (!key) return null;
  return `${base.replace(/\/+$/, '')}/${key}`;
}

/**
 * Apply destination + YouTube RTMP forward fields onto a create/update target.
 * Does not change existing Server Only / YouTube Only provider mapping
 * (handled by applyStreamTypeSelection); only attaches forward credentials.
 *
 * @returns {string|null} error message or null on success
 */
export function applyYoutubeForwardFields(target, body = {}, { isCreate = false } = {}) {
  const destination =
    normalizeStreamingDestination(body.streamingDestination) ||
    normalizeStreamingDestination(body.streamType) ||
    normalizeStreamingDestination(body.linkType) ||
    normalizeStreamingDestination(target.streamingDestination);

  if (destination) {
    target.streamingDestination = destination;
  }

  if (body.youtubeRtmpUrl !== undefined) {
    const url = normalizeYoutubeRtmpUrl(body.youtubeRtmpUrl);
    if (body.youtubeRtmpUrl && url === null) {
      return 'Enter a valid YouTube RTMP URL (e.g. rtmp://a.rtmp.youtube.com/live2).';
    }
    target.youtubeRtmpUrl = url || '';
  }

  if (body.youtubeStreamKey !== undefined) {
    const raw = String(body.youtubeStreamKey || '').trim();
    // Blank on update = keep existing secret.
    if (!raw) {
      if (isCreate) target.youtubeStreamKey = '';
    } else {
      const key = normalizeYoutubeStreamKey(raw);
      if (key === null) {
        return 'YouTube stream key must be 6–128 characters (letters, numbers, . _ -).';
      }
      target.youtubeStreamKey = key;
    }
  }

  if (body.youtubeForwardEnabled !== undefined) {
    target.youtubeForwardEnabled = Boolean(body.youtubeForwardEnabled);
  }

  const dest = target.streamingDestination || destination;
  if (dest === 'server_youtube' || dest === 'youtube_server') {
    // Simultaneous / YouTube+Server: MediaMTX may forward to YouTube.
    if (body.youtubeForwardEnabled === undefined && target.youtubeForwardEnabled == null) {
      target.youtubeForwardEnabled = true;
    }
    if (target.youtubeForwardEnabled == null) target.youtubeForwardEnabled = true;
    if (!target.youtubeRtmpUrl) target.youtubeRtmpUrl = DEFAULT_YOUTUBE_RTMP;
  } else if (dest === 'server') {
    // Server Only — disable forward; keep stored credentials for later reuse.
    if (body.youtubeForwardEnabled === undefined) {
      target.youtubeForwardEnabled = false;
    }
  } else if (dest === 'youtube') {
    // YouTube Only — OBS goes to YouTube directly; no MediaMTX forward.
    if (body.youtubeForwardEnabled === undefined) {
      target.youtubeForwardEnabled = false;
    }
  }

  // Validate required credentials when forward is active.
  const forwardOn =
    (dest === 'server_youtube' ||
      dest === 'youtube_server' ||
      target.streamingDestination === 'server_youtube' ||
      target.streamingDestination === 'youtube_server') &&
    Boolean(target.youtubeForwardEnabled);

  if (forwardOn) {
    const url = normalizeYoutubeRtmpUrl(target.youtubeRtmpUrl || DEFAULT_YOUTUBE_RTMP);
    if (!url) {
      return 'YouTube Server URL is required for Server + YouTube / YouTube + Server streaming.';
    }
    target.youtubeRtmpUrl = url;
    const hasKey = Boolean(String(target.youtubeStreamKey || '').trim());
    if (!hasKey) {
      return 'YouTube Stream Key is required when YouTube forwarding is enabled.';
    }
  }

  return null;
}

/** Strip secrets from a plain event object; expose presence flag for editors. */
export function sanitizeStreamingSecrets(data, { hasYoutubeStreamKey = false } = {}) {
  if (!data || typeof data !== 'object') return data;
  delete data.youtubeStreamKey;
  delete data.rtmpStreamKey;
  data.youtubeStreamKeySet = Boolean(hasYoutubeStreamKey);
  return data;
}

export { DEFAULT_YOUTUBE_RTMP };
