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
 * Public-safe view of an event's streaming configuration (no secret key).
 */
function publicStreamConfig(event) {
  return {
    eventId: event.id,
    provider: event.streamProvider,
    youtubeVideoId: event.youtubeVideoId,
    hlsUrl: event.hlsUrl,
    webrtcUrl: event.webrtcUrl,
    isLive: event.isLive,
    liveStartedAt: event.liveStartedAt,
    liveEndedAt: event.liveEndedAt,
    peakViewers: event.peakViewers,
  };
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
