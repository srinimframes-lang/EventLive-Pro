/**
 * Multi-destination RTMP forward helpers (YouTube, Facebook, …).
 * Reuses the YouTube forward credential model; Facebook is additive.
 * Stream keys must never be logged or returned to browsers.
 */

import {
  DEFAULT_YOUTUBE_RTMP,
  buildYoutubeForwardTarget,
  normalizeStreamingDestination,
  normalizeYoutubeRtmpUrl,
  normalizeYoutubeStreamKey,
} from './youtubeForward.js';

export const DEFAULT_FACEBOOK_RTMP = 'rtmps://live-api-s.facebook.com:443/rtmp';

/** Validate RTMP/RTMPS ingest URL (YouTube or Facebook). */
export function normalizeForwardRtmpUrl(raw) {
  return normalizeYoutubeRtmpUrl(raw);
}

/**
 * Opaque stream keys (YouTube / Facebook Live).
 * Facebook keys are often longer; allow 6–256 safe chars.
 */
export function normalizeForwardStreamKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.length < 6 || value.length > 256) return null;
  if (!/^[A-Za-z0-9._\-]+$/.test(value)) return null;
  return value;
}

export function buildForwardTarget(rtmpUrl, streamKey, { fallbackUrl = '' } = {}) {
  const base = normalizeForwardRtmpUrl(rtmpUrl) || normalizeForwardRtmpUrl(fallbackUrl);
  const key = normalizeForwardStreamKey(streamKey);
  if (!base || !key) return null;
  return `${base.replace(/\/+$/, '')}/${key}`;
}

/** True when the event uses MediaMTX ingest (required for any RTMP forward). */
export function eventUsesServerIngest(event = {}) {
  const dest = normalizeStreamingDestination(event.streamingDestination);
  if (dest === 'server' || dest === 'server_youtube' || dest === 'youtube_server') return true;
  return event.streamProvider === 'rtmp' || event.streamProvider === 'hls';
}

/**
 * Apply Facebook RTMP forward fields onto a create/update target.
 * Does not change streamingDestination / website playback selection.
 *
 * @returns {string|null} error message or null on success
 */
export function applyFacebookForwardFields(target, body = {}, { isCreate = false } = {}) {
  if (body.facebookRtmpUrl !== undefined) {
    const url = normalizeForwardRtmpUrl(body.facebookRtmpUrl);
    if (body.facebookRtmpUrl && url === null) {
      return 'Enter a valid Facebook RTMP URL (e.g. rtmps://live-api-s.facebook.com:443/rtmp).';
    }
    target.facebookRtmpUrl = url || '';
  }

  if (body.facebookStreamKey !== undefined) {
    const raw = String(body.facebookStreamKey || '').trim();
    if (!raw) {
      if (isCreate) target.facebookStreamKey = '';
    } else {
      const key = normalizeForwardStreamKey(raw);
      if (key === null) {
        return 'Facebook stream key must be 6–256 characters (letters, numbers, . _ -).';
      }
      target.facebookStreamKey = key;
    }
  }

  if (body.facebookForwardEnabled !== undefined) {
    target.facebookForwardEnabled = Boolean(body.facebookForwardEnabled);
  }

  const dest =
    normalizeStreamingDestination(target.streamingDestination) ||
    normalizeStreamingDestination(body.streamingDestination) ||
    normalizeStreamingDestination(body.streamType);

  // Pure YouTube (no MediaMTX) cannot forward — OBS does not hit our server.
  if (dest === 'youtube') {
    if (body.facebookForwardEnabled === undefined) {
      target.facebookForwardEnabled = false;
    } else if (target.facebookForwardEnabled) {
      return 'Facebook Live forwarding requires Server ingest (OBS → MediaMTX). Enable Server with Facebook.';
    }
  }

  const forwardOn = Boolean(target.facebookForwardEnabled);
  if (!forwardOn) return null;

  if (!eventUsesServerIngest({ ...target, streamingDestination: dest || target.streamingDestination })) {
    return 'Facebook Live forwarding requires Server ingest (OBS → MediaMTX).';
  }

  if (!target.facebookRtmpUrl) target.facebookRtmpUrl = DEFAULT_FACEBOOK_RTMP;
  const url = normalizeForwardRtmpUrl(target.facebookRtmpUrl || DEFAULT_FACEBOOK_RTMP);
  if (!url) {
    return 'Facebook RTMP URL is required when Facebook forwarding is enabled.';
  }
  target.facebookRtmpUrl = url;

  const hasKey = Boolean(String(target.facebookStreamKey || '').trim());
  if (!hasKey) {
    return 'Facebook Stream Key is required when Facebook forwarding is enabled.';
  }

  return null;
}

/**
 * List enabled MediaMTX → destination RTMP forwards for an event.
 * Used by the VPS multi-forward hook (x-media-secret only).
 *
 * @returns {{ id: string, platform: string, rtmpUrl: string, streamKey: string, target: string }[]}
 */
export function listEnabledForwardTargets(event = {}) {
  const targets = [];
  const dest = normalizeStreamingDestination(event.streamingDestination);

  const youtubeAllowed =
    Boolean(event.youtubeForwardEnabled) &&
    (dest === 'server_youtube' ||
      dest === 'youtube_server' ||
      (!dest && event.streamProvider === 'rtmp')) &&
    dest !== 'server' &&
    dest !== 'youtube';

  if (youtubeAllowed) {
    const ytKey = event.youtubeStreamKey || '';
    const ytUrl = event.youtubeRtmpUrl || DEFAULT_YOUTUBE_RTMP;
    const target =
      buildYoutubeForwardTarget(ytUrl, ytKey) ||
      buildForwardTarget(ytUrl, ytKey, { fallbackUrl: DEFAULT_YOUTUBE_RTMP });
    if (target) {
      targets.push({
        id: 'youtube',
        platform: 'youtube',
        rtmpUrl: normalizeYoutubeRtmpUrl(ytUrl) || DEFAULT_YOUTUBE_RTMP,
        streamKey: ytKey,
        target,
      });
    }
  }

  if (Boolean(event.facebookForwardEnabled) && eventUsesServerIngest(event)) {
    const fbKey = event.facebookStreamKey || '';
    const fbUrl = event.facebookRtmpUrl || DEFAULT_FACEBOOK_RTMP;
    const target = buildForwardTarget(fbUrl, fbKey, { fallbackUrl: DEFAULT_FACEBOOK_RTMP });
    if (target) {
      targets.push({
        id: 'facebook',
        platform: 'facebook',
        rtmpUrl: normalizeForwardRtmpUrl(fbUrl) || DEFAULT_FACEBOOK_RTMP,
        streamKey: fbKey,
        target,
      });
    }
  }

  return targets;
}

/** Strip forward secrets; expose presence flags for editors. */
export function sanitizeForwardSecrets(
  data,
  { hasYoutubeStreamKey = false, hasFacebookStreamKey = false } = {}
) {
  if (!data || typeof data !== 'object') return data;
  delete data.youtubeStreamKey;
  delete data.facebookStreamKey;
  delete data.rtmpStreamKey;
  data.youtubeStreamKeySet = Boolean(hasYoutubeStreamKey);
  data.facebookStreamKeySet = Boolean(hasFacebookStreamKey);
  return data;
}

export { DEFAULT_YOUTUBE_RTMP, buildYoutubeForwardTarget, normalizeYoutubeStreamKey };
