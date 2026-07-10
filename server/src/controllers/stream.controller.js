import { Event } from '../models/Event.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent } from '../utils/ownership.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  buildRtmpCredentials,
  deriveHlsPlaybackUrl,
  deriveWebRtcPlaybackUrl,
  ensureEventStreamKey,
  findEventByStreamKey,
  parseMediaMtxPath,
  probeMediaMtxPublishing,
  resolveStreamKey,
  streamKeyFromEventId,
} from '../utils/mediaStream.js';

async function findEventOr404(id, res, { withKey = false } = {}) {
  const query = Event.findById(id);
  if (withKey) query.select('+rtmpStreamKey');
  const event = await query;
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  return event;
}

/**
 * Public-safe view of an event's streaming configuration (no secret key).
 */
function publicStreamConfig(event, { isPublishing = null } = {}) {
  const youtubeVideoId =
    extractYouTubeId(event.youtubeVideoId) || extractYouTubeId(event.streamUrl) || '';
  const isServerProvider =
    event.streamProvider === 'rtmp' ||
    event.streamProvider === 'hls' ||
    event.streamProvider === 'webrtc';
  const provider = isServerProvider
    ? event.streamProvider
    : event.streamProvider === 'youtube' || youtubeVideoId
      ? 'youtube'
      : event.streamProvider;
  const isServer = provider === 'rtmp' || provider === 'hls';
  const playbackUrl = isServer ? deriveHlsPlaybackUrl(event) : event.hlsUrl;
  const webrtcUrl = isServer ? deriveWebRtcPlaybackUrl(event) : event.webrtcUrl;
  const liveFromProbe = isPublishing === true;
  const offlineFromProbe = isPublishing === false;

  return {
    eventId: event.id,
    provider,
    youtubeVideoId,
    streamUrl: event.streamUrl || '',
    hlsUrl: event.hlsUrl || playbackUrl,
    playbackUrl,
    webrtcUrl,
    poster: event.coverImage || '',
    isLive: liveFromProbe ? true : offlineFromProbe ? false : event.isLive,
    isPublishing: isPublishing === null ? undefined : isPublishing,
    streamDisabled: event.streamDisabled,
    autoRecord: event.autoRecord,
    liveStartedAt: event.liveStartedAt,
    liveEndedAt: event.liveEndedAt,
    peakViewers: event.peakViewers,
    totalViews: event.totalViews,
  };
}

async function publishingStatusForEvent(event) {
  if (event.streamProvider !== 'rtmp' && event.streamProvider !== 'hls') return null;
  return probeMediaMtxPublishing(resolveStreamKey(event));
}

/**
 * Guards the media-server webhooks with a shared secret. Returns true when the
 * request is authorised (or when no secret is configured, for local dev).
 */
function mediaSecretOk(req) {
  if (!env.mediaServerSecret) return true; // not configured (dev) → allow
  return req.get('x-media-secret') === env.mediaServerSecret;
}

/**
 * @route GET /api/events/:id/stream
 * @desc  Public streaming configuration for the player
 * @access Public
 */
export const getStreamConfig = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  const isPublishing = await publishingStatusForEvent(event);
  res.status(200).json({
    success: true,
    data: publicStreamConfig(event, { isPublishing }),
  });
});

/**
 * @route PATCH /api/events/:id/stream
 * @desc  Update streaming configuration (owner/admin)
 * @access Private
 */
export const updateStreamConfig = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const fields = ['streamProvider', 'youtubeVideoId', 'hlsUrl', 'webrtcUrl'];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      event[field] =
        field === 'youtubeVideoId'
          ? extractYouTubeId(req.body[field]) || String(req.body[field] || '').trim()
          : req.body[field];
    }
  }
  if (req.body.autoRecord !== undefined) event.autoRecord = Boolean(req.body.autoRecord);
  await event.save();

  const isPublishing = await publishingStatusForEvent(event);
  res.status(200).json({ success: true, data: publicStreamConfig(event, { isPublishing }) });
});

/**
 * @route GET /api/events/:id/stream/key
 * @desc  Reveal (and lazily create) the RTMP ingest URL + stream key (owner/admin)
 * @access Private
 */
export const getStreamKey = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res, { withKey: true });
  assertCanManageEvent(event, req.user, res);

  await ensureEventStreamKey(event);
  const creds = buildRtmpCredentials(event);

  res.status(200).json({
    success: true,
    data: {
      ingestUrl: creds.ingestUrl,
      streamKey: creds.streamKey,
      fullUrl: creds.fullUrl,
      playbackUrl: creds.playbackUrl,
      webrtcUrl: creds.webrtcUrl,
      mediamtxPath: creds.mediamtxPath,
    },
  });
});

/**
 * @route POST /api/events/:id/stream/key/regenerate
 * @desc  Reset the RTMP stream key to the event id (owner/admin)
 * @access Private
 */
export const regenerateStreamKey = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res, { withKey: true });
  assertCanManageEvent(event, req.user, res);

  event.rtmpStreamKey = streamKeyFromEventId(event._id);
  await event.save();

  const creds = buildRtmpCredentials(event);
  res.status(200).json({
    success: true,
    data: {
      ingestUrl: creds.ingestUrl,
      streamKey: creds.streamKey,
      fullUrl: creds.fullUrl,
      playbackUrl: creds.playbackUrl,
      webrtcUrl: creds.webrtcUrl,
      mediamtxPath: creds.mediamtxPath,
    },
  });
});

/**
 * @route POST /api/events/:id/stream/live
 * @desc  Toggle live status (owner/admin). Body: { live: boolean }
 * @access Private
 */
export const setLiveStatus = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const goLive = Boolean(req.body.live);
  event.isLive = goLive;

  if (goLive) {
    event.liveStartedAt = new Date();
    event.liveEndedAt = undefined;
    if (event.status === 'draft' || event.status === 'published') {
      event.status = 'live';
    }
  } else {
    event.liveEndedAt = new Date();
    if (event.status === 'live') event.status = 'ended';
  }
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      liveStartedAt: event.liveStartedAt,
      liveEndedAt: event.liveEndedAt,
    });
  }

  const isPublishing = await publishingStatusForEvent(event);
  res.status(200).json({ success: true, data: publicStreamConfig(event, { isPublishing }) });
});

/**
 * @route POST /api/events/:id/stream/disable
 * @desc  Disable/enable a private stream (owner/admin). Body: { disabled: bool }
 * @access Private
 */
export const setStreamDisabled = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const disabled = Boolean(req.body.disabled);
  event.streamDisabled = disabled;
  if (disabled && event.isLive) {
    event.isLive = false;
    event.liveEndedAt = new Date();
    if (event.status === 'live') event.status = 'ended';
  }
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      streamDisabled: event.streamDisabled,
    });
  }
  const isPublishing = await publishingStatusForEvent(event);
  res.status(200).json({ success: true, data: publicStreamConfig(event, { isPublishing }) });
});

/**
 * @route POST /api/events/:id/stream/restart
 * @desc  Ask connected players to reconnect (owner/admin). Best-effort signal
 * @access Private
 */
export const restartStream = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const io = req.app.get('io');
  if (io) io.to(`event:${event.id}`).emit('stream:restart', { eventId: event.id });
  const isPublishing = await publishingStatusForEvent(event);
  res.status(200).json({ success: true, data: publicStreamConfig(event, { isPublishing }) });
});

/* ─────────────────── Media-server webhooks (secret-protected) ─────────────── */

/**
 * @route POST /api/events/stream/auth
 * @desc  Called by the media server to authorise an RTMP publish by stream key.
 * @access Media server (x-media-secret)
 */
export const authenticateStream = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }
  const streamKey = parseMediaMtxPath(req.body.streamKey || '');
  if (!streamKey) {
    return res.status(400).json({ ok: false });
  }
  const event = await findEventByStreamKey(streamKey);
  if (!event || event.streamDisabled || ['ended', 'cancelled'].includes(event.status)) {
    return res.status(403).json({ ok: false });
  }
  return res.status(200).json({ ok: true, shortCode: event.shortCode, autoRecord: event.autoRecord });
});

/**
 * @route POST /api/events/stream/mediamtx-auth
 * @desc  MediaMTX external-auth hook.
 * @access Media server (token query)
 */
export const mediamtxAuth = asyncHandler(async (req, res) => {
  if (env.mediaServerSecret && req.query.token !== env.mediaServerSecret) {
    return res.status(401).json({ ok: false });
  }
  const action = req.body?.action;
  if (action !== 'publish') {
    return res.status(200).json({ ok: true });
  }
  const streamKey = parseMediaMtxPath(req.body?.path || req.body?.streamKey || '');
  const event = await findEventByStreamKey(streamKey);
  if (!event || event.streamDisabled || ['ended', 'cancelled'].includes(event.status)) {
    return res.status(401).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
});

/**
 * @route POST /api/events/stream/started
 * @desc  Media server reports a publish started; flip the event live + store URL.
 * @access Media server (x-media-secret)
 */
export const streamStarted = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }
  const streamKey = parseMediaMtxPath(req.body.streamKey || req.body.path || '');
  const event = await findEventByStreamKey(streamKey);
  if (!event) return res.status(404).json({ ok: false });

  event.isLive = true;
  event.liveStartedAt = new Date();
  event.liveEndedAt = undefined;
  if (event.streamProvider === 'none') event.streamProvider = 'rtmp';
  const playbackUrl = deriveHlsPlaybackUrl(event);
  if (playbackUrl) event.hlsUrl = playbackUrl;
  if (['draft', 'published'].includes(event.status)) event.status = 'live';
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: true,
      status: event.status,
      liveStartedAt: event.liveStartedAt,
    });
  }
  return res.status(200).json({ ok: true });
});

/**
 * @route POST /api/events/stream/stopped
 * @desc  Media server reports a publish ended; flip the event offline.
 * @access Media server (x-media-secret)
 */
export const streamStopped = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }
  const streamKey = parseMediaMtxPath(req.body.streamKey || req.body.path || '');
  const event = await findEventByStreamKey(streamKey);
  if (!event) return res.status(404).json({ ok: false });

  event.isLive = false;
  event.liveEndedAt = new Date();
  if (event.status === 'live') event.status = 'ended';
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: false,
      status: event.status,
      liveEndedAt: event.liveEndedAt,
    });
  }
  return res.status(200).json({ ok: true });
});

/**
 * @route GET /api/events/:id/chat
 * @desc  Recent chat history (most recent N, returned oldest-first)
 * @access Public
 */
export const getChatHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const messages = await ChatMessage.find({ event: req.params.id })
    .sort({ createdAt: -1 })
    .limit(limit);
  res.status(200).json({ success: true, data: messages.reverse() });
});

/**
 * @route GET /api/events/:id/questions
 * @desc  List questions for an event (top-voted first)
 * @access Public
 */
export const listQuestions = asyncHandler(async (req, res) => {
  const questions = await Question.find({ event: req.params.id }).sort({
    isAnswered: 1,
    upvotes: -1,
    createdAt: -1,
  });
  res.status(200).json({ success: true, data: questions });
});
