import crypto from 'crypto';
import { Event } from '../models/Event.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent } from '../utils/ownership.js';

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
 * Derives the public HLS playback URL for a private-server (rtmp) event:
 * `${HLS_PLAYBACK_BASE}/live/<shortCode>/master.m3u8`. Falls back to any
 * explicitly-set hlsUrl. Returns '' when nothing is available.
 */
function derivePlaybackUrl(event) {
  if (event.hlsUrl) return event.hlsUrl;
  if (env.hlsPlaybackBase && event.shortCode) {
    return `${env.hlsPlaybackBase}/live/${event.shortCode}/master.m3u8`;
  }
  return '';
}

/**
 * Public-safe view of an event's streaming configuration (no secret key).
 */
function publicStreamConfig(event) {
  const isServer = event.streamProvider === 'rtmp' || event.streamProvider === 'hls';
  return {
    eventId: event.id,
    provider: event.streamProvider,
    youtubeVideoId: event.youtubeVideoId,
    hlsUrl: event.hlsUrl,
    // Playback URL the HLS player should use for private-server streams.
    playbackUrl: isServer ? derivePlaybackUrl(event) : event.hlsUrl,
    webrtcUrl: event.webrtcUrl,
    poster: event.coverImage || '',
    isLive: event.isLive,
    streamDisabled: event.streamDisabled,
    autoRecord: event.autoRecord,
    liveStartedAt: event.liveStartedAt,
    liveEndedAt: event.liveEndedAt,
    peakViewers: event.peakViewers,
    totalViews: event.totalViews,
  };
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
  res.status(200).json({ success: true, data: publicStreamConfig(event) });
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
    if (req.body[field] !== undefined) event[field] = req.body[field];
  }
  if (req.body.autoRecord !== undefined) event.autoRecord = Boolean(req.body.autoRecord);
  await event.save();

  res.status(200).json({ success: true, data: publicStreamConfig(event) });
});

/**
 * @route GET /api/events/:id/stream/key
 * @desc  Reveal (and lazily create) the RTMP ingest URL + stream key (owner/admin)
 * @access Private
 */
export const getStreamKey = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res, { withKey: true });
  assertCanManageEvent(event, req.user, res);

  if (!event.rtmpStreamKey) {
    event.rtmpStreamKey = crypto.randomBytes(16).toString('hex');
    await event.save();
  }

  res.status(200).json({
    success: true,
    data: {
      ingestUrl: env.rtmpIngestUrl,
      streamKey: event.rtmpStreamKey,
      fullUrl: `${env.rtmpIngestUrl}/${event.rtmpStreamKey}`,
    },
  });
});

/**
 * @route POST /api/events/:id/stream/key/regenerate
 * @desc  Rotate the RTMP stream key (owner/admin)
 * @access Private
 */
export const regenerateStreamKey = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res, { withKey: true });
  assertCanManageEvent(event, req.user, res);

  event.rtmpStreamKey = crypto.randomBytes(16).toString('hex');
  await event.save();

  res.status(200).json({
    success: true,
    data: {
      ingestUrl: env.rtmpIngestUrl,
      streamKey: event.rtmpStreamKey,
      fullUrl: `${env.rtmpIngestUrl}/${event.rtmpStreamKey}`,
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

  // Broadcast the status change to everyone in the live room.
  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      liveStartedAt: event.liveStartedAt,
      liveEndedAt: event.liveEndedAt,
    });
  }

  res.status(200).json({ success: true, data: publicStreamConfig(event) });
});

/**
 * @route POST /api/events/:id/stream/disable
 * @desc  Disable/enable a private stream (owner/admin). Body: { disabled: bool }
 *        Disabling blocks new publishes (via the auth webhook) and ends any
 *        current live state.
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
  res.status(200).json({ success: true, data: publicStreamConfig(event) });
});

/**
 * @route POST /api/events/:id/stream/restart
 * @desc  Ask connected players to reconnect (owner/admin). Best-effort signal
 *        used after a broadcaster reconnects their encoder.
 * @access Private
 */
export const restartStream = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const io = req.app.get('io');
  if (io) io.to(`event:${event.id}`).emit('stream:restart', { eventId: event.id });
  res.status(200).json({ success: true, data: publicStreamConfig(event) });
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
  const streamKey = String(req.body.streamKey || '').trim();
  if (!streamKey) {
    return res.status(400).json({ ok: false });
  }
  const event = await Event.findOne({ rtmpStreamKey: streamKey }).select('+rtmpStreamKey');
  // Reject unknown keys, disabled streams, and ended/cancelled events (expiry).
  if (!event || event.streamDisabled || ['ended', 'cancelled'].includes(event.status)) {
    return res.status(403).json({ ok: false });
  }
  return res.status(200).json({ ok: true, shortCode: event.shortCode, autoRecord: event.autoRecord });
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
  const streamKey = String(req.body.streamKey || '').trim();
  const event = await Event.findOne({ rtmpStreamKey: streamKey }).select('+rtmpStreamKey');
  if (!event) return res.status(404).json({ ok: false });

  event.isLive = true;
  event.liveStartedAt = new Date();
  event.liveEndedAt = undefined;
  if (event.streamProvider === 'none') event.streamProvider = 'rtmp';
  if (req.body.playbackUrl) event.hlsUrl = req.body.playbackUrl;
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
  const streamKey = String(req.body.streamKey || '').trim();
  const event = await Event.findOne({ rtmpStreamKey: streamKey }).select('+rtmpStreamKey');
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
