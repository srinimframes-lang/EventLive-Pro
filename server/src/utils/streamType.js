import { extractYouTubeId } from './youtube.js';
import { normalizeStreamingDestination } from './youtubeForward.js';

/** Resolve stream type from request body (`streamType`, `linkType`, or destination). */
export function normalizeStreamType(body = {}) {
  const fromDest = normalizeStreamingDestination(body.streamingDestination);
  if (fromDest) return fromDest;

  const raw = body.streamType ?? body.linkType;
  if (raw === 'server') return 'server';
  if (raw === 'youtube') return 'youtube';
  if (raw === 'server_youtube') return 'server_youtube';
  return normalizeStreamingDestination(raw);
}

/** Map stored event fields back to form stream / destination type. */
export function streamTypeFromEvent(event = {}) {
  const dest = normalizeStreamingDestination(event.streamingDestination);
  if (dest) return dest;

  if (
    event.streamProvider === 'rtmp' ||
    event.streamProvider === 'hls' ||
    event.creditType === 'server'
  ) {
    if (event.youtubeForwardEnabled) return 'server_youtube';
    return 'server';
  }
  if (
    event.streamProvider === 'youtube' ||
    event.creditType === 'youtube' ||
    event.youtubeVideoId
  ) {
    return 'youtube';
  }
  return 'youtube';
}

/**
 * Apply stream-type selection to a create/update payload.
 * YouTube → streamProvider youtube; Premium Server / Simultaneous → streamProvider rtmp.
 * Existing Server Only and YouTube Only behaviour is unchanged.
 */
export function applyStreamTypeSelection(payload, streamType, { isCreate = false } = {}) {
  if (!streamType) return;

  if (streamType === 'server') {
    payload.streamProvider = 'rtmp';
    payload.streamingDestination = 'server';
    if (payload.creditType !== 'none') payload.creditType = 'server';
    payload.youtubeVideoId = '';
    payload.streamUrl = '';
    payload.youtubeForwardEnabled = false;
    // rtmpStreamKey is assigned from the event id in the Event pre-save hook.
    return;
  }

  if (streamType === 'server_youtube') {
    payload.streamProvider = 'rtmp';
    payload.streamingDestination = 'server_youtube';
    if (payload.creditType !== 'none') payload.creditType = 'server';
    // Website plays server HLS; YouTube gets a MediaMTX RTMP forward.
    // Do not clear youtubeVideoId — optional share link may still be stored.
    if (payload.youtubeForwardEnabled === undefined) {
      payload.youtubeForwardEnabled = true;
    }
    return;
  }

  if (streamType === 'youtube') {
    payload.streamProvider = 'youtube';
    payload.streamingDestination = 'youtube';
    if (payload.creditType !== 'none') payload.creditType = 'youtube';
    payload.youtubeForwardEnabled = false;
    const yid =
      extractYouTubeId(payload.youtubeVideoId) || extractYouTubeId(payload.streamUrl) || '';
    if (yid) payload.youtubeVideoId = yid;
    if (isCreate) {
      payload.hlsUrl = '';
      payload.webrtcUrl = '';
    }
  }
}

export function validateOnlineStreamPayload(payload, streamType) {
  if (payload.isOnline === false) return null;
  const resolved = streamType || inferStreamTypeFromPayload(payload);
  if (!resolved) return 'Stream type is required for online events.';
  if (resolved === 'youtube') {
    const yid =
      extractYouTubeId(payload.youtubeVideoId) || extractYouTubeId(payload.streamUrl) || '';
    if (!yid) return 'A valid YouTube Live URL is required for YouTube Live events.';
  }
  // server / server_youtube validated via youtubeForward fields separately.
  return null;
}

function inferStreamTypeFromPayload(payload) {
  const dest = normalizeStreamingDestination(payload.streamingDestination);
  if (dest) return dest;
  const yid =
    extractYouTubeId(payload.youtubeVideoId) || extractYouTubeId(payload.streamUrl) || '';
  if (yid && payload.streamProvider !== 'rtmp' && payload.streamProvider !== 'hls') {
    return 'youtube';
  }
  if (payload.streamProvider === 'rtmp' || payload.streamProvider === 'hls') {
    return payload.youtubeForwardEnabled ? 'server_youtube' : 'server';
  }
  return null;
}

export function resolveStreamType(body, payload) {
  return normalizeStreamType(body) || inferStreamTypeFromPayload(payload);
}
