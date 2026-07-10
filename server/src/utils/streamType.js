import { extractYouTubeId } from './youtube.js';

/** Resolve stream type from request body (`streamType` or legacy `linkType`). */
export function normalizeStreamType(body = {}) {
  const raw = body.streamType ?? body.linkType;
  if (raw === 'server') return 'server';
  if (raw === 'youtube') return 'youtube';
  return null;
}

/** Map stored event fields back to form stream type. */
export function streamTypeFromEvent(event = {}) {
  if (
    event.streamProvider === 'rtmp' ||
    event.streamProvider === 'hls' ||
    event.creditType === 'server'
  ) {
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
 * YouTube → streamProvider youtube; Premium Server → streamProvider rtmp.
 */
export function applyStreamTypeSelection(payload, streamType, { isCreate = false } = {}) {
  if (!streamType) return;

  if (streamType === 'server') {
    payload.streamProvider = 'rtmp';
    if (payload.creditType !== 'none') payload.creditType = 'server';
    payload.youtubeVideoId = '';
    payload.streamUrl = '';
    // rtmpStreamKey is assigned from the event id in the Event pre-save hook.
    return;
  }

  if (streamType === 'youtube') {
    payload.streamProvider = 'youtube';
    if (payload.creditType !== 'none') payload.creditType = 'youtube';
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
  return null;
}

function inferStreamTypeFromPayload(payload) {
  const yid =
    extractYouTubeId(payload.youtubeVideoId) || extractYouTubeId(payload.streamUrl) || '';
  if (yid) return 'youtube';
  if (payload.streamProvider === 'rtmp' || payload.streamProvider === 'hls') return 'server';
  return null;
}

export function resolveStreamType(body, payload) {
  return normalizeStreamType(body) || inferStreamTypeFromPayload(payload);
}
