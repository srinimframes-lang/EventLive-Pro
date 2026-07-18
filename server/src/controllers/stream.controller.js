import { Event } from '../models/Event.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent, canManageEvent } from '../utils/ownership.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  buildRtmpCredentials,
  deriveHlsPlaybackUrl,
  deriveWebRtcPlaybackUrl,
  ensureEventStreamKey,
  findEventByStreamKey,
  normalizePlaybackUrl,
  parseMediaMtxPath,
  probeMediaMtxPublishing,
  resolveStreamKey,
  streamKeyFromEventId,
} from '../utils/mediaStream.js';
import {
  addDays,
  applyRecordingToEvent,
  buildAdminRecordingUrl,
  buildPublicRecordingUrl,
  getRecordingState,
  RECORDING_PUBLIC_DAYS,
  resolveRecordingAbsolutePath,
} from '../utils/recording.js';
import {
  deleteRecordingFromR2,
  isR2Configured,
  presignRecordingUrl,
  r2PublicUrl,
  uploadRecordingToR2,
} from '../utils/r2.js';
import fs from 'fs';
import path from 'path';
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
  const playbackUrl = isServer
    ? normalizePlaybackUrl(deriveHlsPlaybackUrl(event))
    : event.hlsUrl;
  const webrtcUrl = isServer ? deriveWebRtcPlaybackUrl(event) : event.webrtcUrl;
  const liveFromProbe = isPublishing === true;
  const offlineFromProbe = isPublishing === false;
  const isLive = liveFromProbe ? true : offlineFromProbe ? false : event.isLive;
  const rec = getRecordingState(event);
  const recordingUrl = isLive ? '' : buildPublicRecordingUrl(event);
  const playbackMode = isLive ? 'live' : recordingUrl ? 'recorded' : 'offline';

  return {
    eventId: event.id,
    provider,
    youtubeVideoId,
    streamUrl: event.streamUrl || '',
    hlsUrl: isServer ? playbackUrl : event.hlsUrl,
    playbackUrl,
    webrtcUrl,
    poster: event.coverImage || '',
    isLive,
    isPublishing: isPublishing === null ? undefined : isPublishing,
    streamDisabled: event.streamDisabled,
    autoRecord: event.autoRecord,
    liveStartedAt: event.liveStartedAt,
    liveEndedAt: event.liveEndedAt,
    peakViewers: event.peakViewers,
    totalViews: event.totalViews,
    // Recorded replay
    playbackMode,
    recordingUrl,
    hasRecording: rec.hasRecording,
    recordingAvailable: Boolean(recordingUrl),
    recordingPublicUntil: rec.recordingPublicUntil,
    recordingRecordedAt: rec.recordingRecordedAt,
    recordingDurationSec: rec.recordingDurationSec,
  };
}

/** Admin-only recording metadata (includes hidden/expired files that still exist). */
function adminRecordingConfig(event) {
  const rec = getRecordingState(event);
  return {
    ...rec,
    recordingUrl: buildAdminRecordingUrl(event),
    downloadUrl: rec.downloadPath,
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

/** Whether an event may accept a new RTMP publish (re-stream after ended is OK). */
function publishAllowed(event) {
  if (!event || event.streamDisabled) return false;
  if (event.status === 'cancelled') return false;
  return true;
}

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
  if (!publishAllowed(event)) {
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
  if (!publishAllowed(event)) {
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
  if (['draft', 'published', 'ended'].includes(event.status)) event.status = 'live';
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

  const rec = getRecordingState(event);
  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: false,
      status: event.status,
      liveEndedAt: event.liveEndedAt,
      playbackMode: rec.publiclyVisible ? 'recorded' : 'offline',
      recordingUrl: buildPublicRecordingUrl(event),
      recordingAvailable: rec.publiclyVisible,
    });
  }
  return res.status(200).json({ ok: true });
});

/* ─────────────────── Recorded replay ──────────────────────────────────────── */

/**
 * @route POST /api/events/stream/recording-ready
 * @desc  MediaMTX finalize hook registers the MP4 path in MongoDB.
 * @access Media server (x-media-secret)
 */
export const recordingReady = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const eventId = String(req.body.eventId || '').trim();
  const filePath = String(req.body.filePath || req.body.recordingPath || '').trim();
  const durationSec = Number(req.body.durationSec ?? req.body.duration ?? 0) || 0;
  const streamKey = parseMediaMtxPath(req.body.path || req.body.streamKey || eventId);

  let event = null;
  if (eventId && /^[a-fA-F0-9]{24}$/.test(eventId)) {
    event = await Event.findById(eventId);
  }
  if (!event && streamKey) {
    event = await findEventByStreamKey(streamKey);
  }
  if (!event) return res.status(404).json({ ok: false, error: 'event_not_found' });

  try {
    applyRecordingToEvent(event, { filePath, durationSec });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'invalid_recording' });
  }

  // Stream has finished recording — ensure event is offline / ended.
  event.isLive = false;
  event.liveEndedAt = event.liveEndedAt || new Date();
  if (event.status === 'live' || event.status === 'published' || event.status === 'draft') {
    event.status = 'ended';
  }
  await event.save();

  const rec = getRecordingState(event);
  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: false,
      status: event.status,
      liveEndedAt: event.liveEndedAt,
      playbackMode: 'recorded',
      recordingUrl: buildPublicRecordingUrl(event),
      recordingAvailable: true,
      recordingPublicUntil: rec.recordingPublicUntil,
    });
  }

  // Durable storage: upload to Cloudflare R2 in the background, verify, then
  // remove the local VPS copy. Playback keeps working via the API route in
  // both states (local file first, R2 after migration).
  if (isR2Configured()) {
    uploadEventRecordingToR2(event.id).catch((err) => {
      console.error(`[r2] background upload failed for event ${event.id}:`, err.message);
    });
  } else {
    console.warn('[r2] not configured — recording kept on local disk only');
  }

  return res.status(200).json({
    ok: true,
    eventId: event.id,
    recordingUrl: event.recordingUrl,
    recordingPath: event.recordingPath,
    recordingPublicUntil: event.recordingPublicUntil,
  });
});

/**
 * Upload an event's local recording to R2, verify it, persist the object URL
 * in MongoDB, then delete the local VPS copy. Logs success/failure.
 */
async function uploadEventRecordingToR2(eventId) {
  const event = await Event.findById(eventId);
  if (!event) throw new Error('event not found');
  if (event.recordingStorage === 'r2' && event.recordingR2Key) return; // already migrated

  const abs = resolveRecordingAbsolutePath(event.recordingPath);
  if (!abs || !fs.existsSync(abs)) throw new Error(`local recording missing: ${event.recordingPath}`);

  const key = `recordings/${event.id}/${path.basename(abs)}`;
  console.log(`[r2] uploading ${abs} -> ${key}`);
  const { url, size } = await uploadRecordingToR2(abs, key);
  console.log(`[r2] upload verified (${size} bytes): ${url}`);

  event.recordingStorage = 'r2';
  event.recordingR2Key = key;
  event.recordingR2Url = url;
  await event.save();

  // Only delete the local copy after the verified upload is saved in MongoDB.
  try {
    fs.unlinkSync(abs);
    console.log(`[r2] local copy removed: ${abs}`);
  } catch (err) {
    console.warn(`[r2] could not remove local copy ${abs}: ${err.message}`);
  }
}

/**
 * @route GET /api/events/:id/stream/recording
 * @desc  Stream the recorded MP4 (public within 30 days; admins always if file exists).
 * @access Public (gated) / Private admin override
 */
export const playRecording = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  const rec = getRecordingState(event);
  if (!rec.hasRecording) {
    res.status(404);
    throw new Error('Recording not found');
  }

  const isAdmin = Boolean(req.user && canManageEvent(event, req.user));
  if (!rec.publiclyVisible && !isAdmin) {
    res.status(404);
    throw new Error('Recording is not available');
  }

  // R2-backed: redirect to the public bucket URL (or a presigned URL).
  if (rec.recordingStorage === 'r2' && rec.recordingR2Key) {
    const publicUrl = r2PublicUrl(rec.recordingR2Key);
    const target = publicUrl || (await presignRecordingUrl(rec.recordingR2Key));
    if (!target) {
      res.status(500);
      throw new Error('R2 recording URL unavailable');
    }
    return res.redirect(302, target);
  }

  const abs = resolveRecordingAbsolutePath(rec.recordingPath);
  if (!abs || !fs.existsSync(abs)) {
    res.status(404);
    throw new Error('Recording file missing');
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(abs);
});

/**
 * @route GET /api/events/:id/stream/recording/url
 * @desc  JSON play URL for the browser player (presigned R2 or same-origin API).
 *        Avoids fragile <video> cross-origin redirect handling.
 * @access Public (gated) / Private admin override
 */
export const getRecordingPlayUrl = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  const rec = getRecordingState(event);
  if (!rec.hasRecording) {
    res.status(404);
    throw new Error('Recording not found');
  }

  const isAdmin = Boolean(req.user && canManageEvent(event, req.user));
  if (!rec.publiclyVisible && !isAdmin) {
    res.status(404);
    throw new Error('Recording is not available');
  }

  if (rec.recordingStorage === 'r2' && rec.recordingR2Key) {
    const publicUrl = r2PublicUrl(rec.recordingR2Key);
    const url = publicUrl || (await presignRecordingUrl(rec.recordingR2Key, { expiresIn: 6 * 3600 }));
    if (!url) {
      res.status(500);
      throw new Error('R2 recording URL unavailable');
    }
    return res.status(200).json({
      success: true,
      data: {
        url,
        storage: 'r2',
        expiresInSec: publicUrl ? null : 6 * 3600,
        filename: rec.recordingFilename,
      },
    });
  }

  // Local disk: browser plays via the streaming API route on this same origin.
  const apiOrigin = `${req.protocol}://${req.get('host') || 'localhost'}`.replace(/\/+$/, '');
  return res.status(200).json({
    success: true,
    data: {
      url: `${apiOrigin}/api/events/${event.id}/stream/recording`,
      storage: 'local',
      expiresInSec: null,
      filename: rec.recordingFilename,
    },
  });
});

/**
 * @route GET /api/events/:id/stream/recording/download
 * @desc  Download the recorded MP4 (owner/admin).
 * @access Private
 */
export const downloadRecording = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);
  const rec = getRecordingState(event);
  if (!rec.hasRecording) {
    res.status(404);
    throw new Error('Recording not found');
  }

  const filename = rec.recordingFilename || `recording-${event.id}.mp4`;

  if (rec.recordingStorage === 'r2' && rec.recordingR2Key) {
    const target = await presignRecordingUrl(rec.recordingR2Key, {
      downloadFilename: filename,
    });
    if (!target) {
      res.status(500);
      throw new Error('R2 recording URL unavailable');
    }
    return res.redirect(302, target);
  }

  const abs = resolveRecordingAbsolutePath(rec.recordingPath);
  if (!abs || !fs.existsSync(abs)) {
    res.status(404);
    throw new Error('Recording file missing');
  }
  return res.download(abs, filename);
});

/**
 * @route GET /api/events/:id/stream/recording/meta
 * @desc  Admin recording metadata + control flags.
 * @access Private
 */
export const getRecordingMeta = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);
  res.status(200).json({ success: true, data: adminRecordingConfig(event) });
});

/**
 * @route POST /api/events/:id/stream/recording/hide
 * @desc  Hide recording from public visitors (file kept).
 * @access Private
 */
export const hideRecording = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);
  const rec = getRecordingState(event);
  if (!rec.hasRecording) {
    res.status(404);
    throw new Error('Recording not found');
  }
  event.recordingHidden = true;
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      playbackMode: event.isLive ? 'live' : 'offline',
      recordingUrl: '',
      recordingAvailable: false,
    });
  }

  res.status(200).json({ success: true, data: adminRecordingConfig(event) });
});

/**
 * @route POST /api/events/:id/stream/recording/restore
 * @desc  Restore a hidden recording to public view (extends 30-day window if expired).
 * @access Private
 */
export const restoreRecording = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);
  const rec = getRecordingState(event);
  if (!rec.hasRecording) {
    res.status(404);
    throw new Error('Recording not found');
  }

  event.recordingHidden = false;
  // If the public window already elapsed, grant another 30 days from now.
  if (rec.recordingExpired || !event.recordingPublicUntil || new Date() > event.recordingPublicUntil) {
    event.recordingPublicUntil = addDays(new Date(), RECORDING_PUBLIC_DAYS);
  }
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      playbackMode: event.isLive ? 'live' : 'recorded',
      recordingUrl: buildPublicRecordingUrl(event),
      recordingAvailable: !event.isLive,
      recordingPublicUntil: event.recordingPublicUntil,
    });
  }

  res.status(200).json({ success: true, data: adminRecordingConfig(event) });
});

/**
 * @route DELETE /api/events/:id/stream/recording
 * @desc  Permanently delete the MP4 from disk and clear MongoDB recording fields.
 * @access Private
 */
export const deleteRecordingPermanently = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);
  const abs = resolveRecordingAbsolutePath(event.recordingPath);

  if (abs && fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch {
      res.status(500);
      throw new Error('Failed to delete recording file');
    }
  }

  if (event.recordingR2Key) {
    try {
      await deleteRecordingFromR2(event.recordingR2Key);
      console.log(`[r2] deleted object ${event.recordingR2Key}`);
    } catch (err) {
      console.error(`[r2] failed to delete ${event.recordingR2Key}: ${err.message}`);
      res.status(500);
      throw new Error('Failed to delete recording from R2');
    }
  }

  event.recordingPath = '';
  event.recordingFilename = '';
  event.recordingUrl = '';
  event.recordingStorage = 'local';
  event.recordingR2Key = '';
  event.recordingR2Url = '';
  event.recordingDurationSec = 0;
  event.recordingHidden = false;
  event.recordingDeletedAt = new Date();
  event.recordingRecordedAt = undefined;
  event.recordingPublicUntil = undefined;
  await event.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      playbackMode: event.isLive ? 'live' : 'offline',
      recordingUrl: '',
      recordingAvailable: false,
    });
  }

  res.status(200).json({ success: true, data: { deleted: true } });
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
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const questions = await Question.find({ event: req.params.id })
    .sort({
      isAnswered: 1,
      upvotes: -1,
      createdAt: -1,
    })
    .limit(limit);
  res.status(200).json({ success: true, data: questions });
});
