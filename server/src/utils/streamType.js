import { extractYouTubeId } from './youtube.js';
import { normalizeStreamingDestination } from './youtubeForward.js';

function youtubeIdFromPayload(payload = {}) {
  return (
    extractYouTubeId(payload.youtubeLiveUrl) ||
    extractYouTubeId(payload.youtubeWatchUrl) ||
    extractYouTubeId(payload.streamUrl) ||
    extractYouTubeId(payload.youtubeVideoId) ||
    ''
  );
}

/** Resolve stream type from request body (`streamType`, `linkType`, or destination). */
export function normalizeStreamType(body = {}) {
  const fromDest = normalizeStreamingDestination(body.streamingDestination);
  if (fromDest) return fromDest;

  const raw = body.streamType ?? body.linkType;
  if (raw === 'server') return 'server';
  if (raw === 'youtube') return 'youtube';
  if (raw === 'server_youtube') return 'server_youtube';
  if (raw === 'youtube_server') return 'youtube_server';
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

/** True when MediaMTX ingest is used (server path). */
export function usesServerIngest(streamType) {
  return streamType === 'server' || streamType === 'server_youtube' || streamType === 'youtube_server';
}

/** True when MediaMTX should ffmpeg-forward to YouTube. */
export function usesYoutubeForward(streamType) {
  return streamType === 'server_youtube' || streamType === 'youtube_server';
}

/**
 * Apply stream-type selection to a create/update payload.
 * Existing Server / YouTube / Server+YouTube behaviour is unchanged.
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
    return;
  }

  if (streamType === 'server_youtube') {
    payload.streamProvider = 'rtmp';
    payload.streamingDestination = 'server_youtube';
    if (payload.creditType !== 'none') payload.creditType = 'server';
    // Website plays server HLS; YouTube gets a MediaMTX RTMP forward.
    if (payload.youtubeForwardEnabled === undefined) {
      payload.youtubeForwardEnabled = true;
    }
    return;
  }

  if (streamType === 'youtube_server') {
    // OBS → MediaMTX (+ record + forward). Website live player = YouTube embed.
    payload.streamProvider = 'rtmp';
    payload.streamingDestination = 'youtube_server';
    if (payload.creditType !== 'none') payload.creditType = 'server';
    if (payload.youtubeForwardEnabled === undefined) {
      payload.youtubeForwardEnabled = true;
    }
    const yid = youtubeIdFromPayload(payload);
    if (yid) payload.youtubeVideoId = yid;
    return;
  }

  if (streamType === 'youtube') {
    payload.streamProvider = 'youtube';
    payload.streamingDestination = 'youtube';
    if (payload.creditType !== 'none') payload.creditType = 'youtube';
    payload.youtubeForwardEnabled = false;
    const yid = youtubeIdFromPayload(payload);
    if (yid) payload.youtubeVideoId = yid;
    if (isCreate) {
      payload.hlsUrl = '';
      payload.webrtcUrl = '';
    }
  }
}

export function validateOnlineStreamPayload(payload, streamType, options = {}) {
  if (payload.isOnline === false) return null;
  const resolved = streamType || inferStreamTypeFromPayload(payload);
  if (!resolved) return 'Stream type is required for online events.';
  if (resolved === 'youtube' || resolved === 'youtube_server') {
    const yid = youtubeIdFromPayload(payload);
    if (!yid && !options.allowMissingYoutubeUrl) {
      return resolved === 'youtube_server'
        ? 'A valid YouTube Live / embed URL is required for YouTube + Server events.'
        : 'A valid YouTube Live URL is required for YouTube Live events.';
    }
  }
  return null;
}

function inferStreamTypeFromPayload(payload) {
  const dest = normalizeStreamingDestination(payload.streamingDestination);
  if (dest) return dest;
  const yid = youtubeIdFromPayload(payload);
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
