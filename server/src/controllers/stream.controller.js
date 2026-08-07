import { Event } from '../models/Event.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent, canManageEvent } from '../utils/ownership.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  buildOriginHlsPlaybackUrl,
  buildRtmpCredentials,
  deriveHlsPlaybackUrl,
  deriveOriginHlsPlaybackUrl,
  deriveWebRtcPlaybackUrl,
  ensureEventStreamKey,
  findEventByStreamKey,
  isAdaptiveStreamingEnabled,
  normalizePlaybackUrl,
  parseMediaMtxPath,
  probeMediaMtxPublishing,
  resolveStreamKey,
  streamKeyFromEventId,
} from '../utils/mediaStream.js';
import { getViewerHlsPlaybackBase, isHlsCdnEnabled } from '../utils/hlsCdn.js';
import {
  addDays,
  applyRecordingToEvent,
  buildAdminRecordingUrl,
  buildPublicRecordingUrl,
  clearAllRecordingFields,
  getRecordingState,
  listActiveRecordingParts,
  markRecordingPartUploaded,
  RECORDING_PUBLIC_DAYS,
  removeRecordingPart,
  resolveRecordingAbsolutePath,
  resolveRecordingPartForPlayback,
} from '../utils/recording.js';
import {
  deleteRecordingFromR2,
  isR2Configured,
  presignRecordingUrl,
  r2PublicUrl,
  uploadRecordingToR2,
} from '../utils/r2.js';
import {
  applyEmergencyAction,
  evaluateStreamHealth,
  isFailoverCandidate,
  probeHlsPlaylist,
  publicFailoverSlice,
  resolveActiveSource,
  resolveBackupYoutubeId,
} from '../utils/streamFailover.js';
import {
  buildYoutubeForwardTarget,
  DEFAULT_YOUTUBE_RTMP,
} from '../utils/youtubeForward.js';
import {
  DEFAULT_FACEBOOK_RTMP,
  listEnabledForwardTargets,
  buildForwardTarget,
  describeForwardEligibility,
} from '../utils/streamForward.js';
import {
  clearMergeTimer,
  clearOfflineTimer,
  isWithinReconnectGrace,
  LIVE_RECONNECT_GRACE_MS,
  RECORDING_MERGE_GRACE_MS,
  scheduleMergeTimer,
  scheduleOfflineTimer,
} from '../utils/streamReconnect.js';
import { mergeEventRecordings } from '../utils/mergeRecordings.js';
import { isPlatformAdmin } from '../utils/tenantScope.js';
import fs from 'fs';
import path from 'path';

/**
 * Resolve a browser-playable R2 URL (public base or presigned).
 * Returns '' when this host cannot mint URLs (typical on Render without R2 env).
 */
async function resolveR2BrowserUrl(r2Key, { expiresIn = 3600 } = {}) {
  if (!r2Key) return '';
  const publicUrl = r2PublicUrl(r2Key);
  if (publicUrl) return publicUrl;
  if (!isR2Configured()) return '';
  try {
    return (await presignRecordingUrl(r2Key, { expiresIn })) || '';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[recording] R2 presign failed:', err?.message || err);
    return '';
  }
}

function recordingPartQuery(part) {
  const id = part?._id || part?.id;
  return id ? `?part=${encodeURIComponent(String(id))}` : '';
}

/** VPS (or RECORDING_API_ORIGIN) play URL — has R2 credentials / local files. */
function fallbackRecordingPlayUrl(eventId, part) {
  const origin = String(env.recordingApiOrigin || '').replace(/\/+$/, '');
  if (!origin) return '';
  return `${origin}/api/events/${eventId}/stream/recording${recordingPartQuery(part)}`;
}

function requestOrigin(req) {
  return `${req.protocol}://${req.get('host') || 'localhost'}`.replace(/\/+$/, '');
}

/** True when this request is already on the recording fallback host (avoid loops). */
function isOnRecordingFallbackHost(req) {
  const fallback = String(env.recordingApiOrigin || '').replace(/\/+$/, '').toLowerCase();
  if (!fallback) return false;
  const here = requestOrigin(req).toLowerCase();
  if (here === fallback) return true;
  try {
    return new URL(here).hostname === new URL(fallback).hostname;
  } catch {
    return false;
  }
}

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
  const destination = String(event.streamingDestination || '')
    .toLowerCase()
    .replace(/-/g, '_');
  // YouTube + Server: ingest/record/forward on MediaMTX; public live UI = YouTube embed only.
  const youtubePlusServer = destination === 'youtube_server';

  const isServerProvider =
    event.streamProvider === 'rtmp' ||
    event.streamProvider === 'hls' ||
    event.streamProvider === 'webrtc';
  // Keep real provider (usually rtmp) so status polls / recordings keep working.
  // LivePlayer decides embed vs HLS from streamingDestination, not provider alone.
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
  const reconnecting = isWithinReconnectGrace(event);
  // Keep viewers on live during short OBS drops even if MediaMTX probe is briefly false.
  const isLive = liveFromProbe
    ? true
    : reconnecting
      ? true
      : offlineFromProbe
        ? false
        : Boolean(event.isLive);
  const rec = getRecordingState(event);
  const recordingUrl = isLive ? '' : buildPublicRecordingUrl(event);
  const playbackMode = isLive
    ? reconnecting
      ? 'reconnecting'
      : 'live'
    : recordingUrl
      ? 'recorded'
      : 'offline';

  const base = {
    eventId: event.id,
    provider,
    streamingDestination: event.streamingDestination || undefined,
    // Public watch page must use YouTube embed for this destination (never HLS).
    viewerPlayback: youtubePlusServer
      ? 'youtube'
      : isServer
        ? 'hls'
        : provider === 'youtube'
          ? 'youtube'
          : undefined,
    youtubeVideoId,
    streamUrl: event.streamUrl || '',
    // Never expose live HLS to the public player for YouTube + Server.
    hlsUrl: youtubePlusServer ? '' : isServer ? playbackUrl : event.hlsUrl,
    playbackUrl: youtubePlusServer ? '' : playbackUrl,
    hlsCdnEnabled: isHlsCdnEnabled(),
    hlsPlaybackBase: getViewerHlsPlaybackBase(),
    adaptiveStreaming: isServer ? isAdaptiveStreamingEnabled(event) : false,
    webrtcUrl: youtubePlusServer ? '' : webrtcUrl,
    poster: event.coverImage || '',
    isLive,
    reconnecting,
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
    recordingCount: rec.recordingCount,
    recordingMergeStatus: event.recordingMergeStatus || '',
    // Lightweight part list for the player (no R2 URLs — resolve per part on demand).
    // After a successful merge only one part remains active — Parts UI stays hidden.
    recordings: recordingUrl
      ? rec.parts.map((p) => ({
          id: p.id,
          part: p.part,
          durationSec: p.durationSec,
          startedAt: p.startedAt,
          createdAt: p.createdAt,
          filename: p.filename,
        }))
      : [],
  };

  // Additive failover fields only when FAILOVER_ENABLED=true. When off, response
  // shape matches historical livestream config (no player behaviour change).
  const failover = publicFailoverSlice(event, { failoverEnabled: env.failoverEnabled });
  if (failover) Object.assign(base, failover);

  return base;
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

function emitLiveStatus(io, event, extra = {}) {
  if (!io) return;
  const rec = getRecordingState(event);
  const reconnecting = isWithinReconnectGrace(event);
  const isLive = Boolean(event.isLive) || reconnecting;
  io.to(`event:${event.id}`).emit('stream:status', {
    isLive,
    reconnecting,
    status: event.status,
    liveStartedAt: event.liveStartedAt,
    liveEndedAt: event.liveEndedAt,
    playbackMode: isLive ? (reconnecting ? 'reconnecting' : 'live') : rec.publiclyVisible ? 'recorded' : 'offline',
    recordingUrl: isLive ? '' : buildPublicRecordingUrl(event),
    recordingAvailable: !isLive && rec.publiclyVisible,
    recordingCount: rec.recordingCount,
    recordingMergeStatus: event.recordingMergeStatus || '',
    recordings: !isLive && rec.publiclyVisible
      ? rec.parts.map((p) => ({
          id: p.id,
          part: p.part,
          durationSec: p.durationSec,
          startedAt: p.startedAt,
          createdAt: p.createdAt,
          filename: p.filename,
        }))
      : [],
    ...extra,
  });
}

function scheduleRecordingMerge(eventId, io) {
  scheduleMergeTimer(eventId, RECORDING_MERGE_GRACE_MS, async () => {
    await mergeEventRecordings(eventId, { io });
  });
}

/** Persist true offline after reconnect grace expires (or immediately when forced). */
async function finalizeEventOffline(eventId, { io = null } = {}) {
  const event = await Event.findById(eventId);
  if (!event) return null;

  // Publisher came back before we ran — abort.
  if (isWithinReconnectGrace(event) && event.isLive) {
    return event;
  }

  event.isLive = false;
  event.liveReconnecting = false;
  event.liveReconnectUntil = undefined;
  event.liveEndedAt = event.liveEndedAt || new Date();
  if (event.status === 'live') event.status = 'ended';
  await event.save();

  emitLiveStatus(io, event);
  scheduleRecordingMerge(event.id, io);
  return event;
}

/**
 * If reconnect grace expired while the API process was restarted, finalize lazily.
 */
async function resolveExpiredReconnect(event, io) {
  if (!event.liveReconnecting) return event;
  if (isWithinReconnectGrace(event)) return event;
  return (await finalizeEventOffline(event.id, { io })) || event;
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
  let event = await findEventOr404(req.params.id, res);
  const io = req.app.get('io');
  event = (await resolveExpiredReconnect(event, io)) || event;
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

  // Backup stream settings (safe to store even when FAILOVER_ENABLED=false;
  // worker/player stay dormant until the flag is on).
  if (req.body.backupStreamEnabled !== undefined) {
    event.backupStreamEnabled = Boolean(req.body.backupStreamEnabled);
    if (event.backupStreamEnabled && event.backupStatus === 'idle') {
      event.backupStatus = 'monitoring';
    }
    if (!event.backupStreamEnabled && event.backupStatus !== 'disabled') {
      event.backupStatus = 'idle';
    }
  }
  if (req.body.backupYoutubeVideoId !== undefined) {
    event.backupYoutubeVideoId =
      extractYouTubeId(req.body.backupYoutubeVideoId) ||
      String(req.body.backupYoutubeVideoId || '').trim();
  }
  if (event.streamProvider === 'rtmp' || event.streamProvider === 'hls') {
    event.primaryStream = 'server';
  } else if (event.streamProvider === 'youtube') {
    event.primaryStream = 'youtube';
  }

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
 * @route GET /api/events/:id/stream/health
 * @desc  Stream health / failover status (dormant payload when feature off)
 * @access Public
 */
export const getStreamHealth = asyncHandler(async (req, res) => {
  if (!env.failoverEnabled) {
    return res.status(200).json({
      success: true,
      data: { failoverFeatureEnabled: false },
    });
  }

  const event = await findEventOr404(req.params.id, res);
  const playbackUrl = deriveOriginHlsPlaybackUrl(event);
  const [playlistOk, publishing] = await Promise.all([
    event.streamProvider === 'rtmp' || event.streamProvider === 'hls'
      ? probeHlsPlaylist(playbackUrl)
      : Promise.resolve(null),
    publishingStatusForEvent(event),
  ]);

  let healthy = null;
  let reason = '';
  if (playlistOk !== null) {
    const verdict = evaluateStreamHealth({ playlistOk, publishing });
    healthy = verdict.healthy;
    reason = verdict.reason;
  }

  const slice = publicFailoverSlice(event, { failoverEnabled: true });
  return res.status(200).json({
    success: true,
    data: {
      ...slice,
      healthy,
      reason,
      isFailoverCandidate: isFailoverCandidate(event, { failoverEnabled: true }),
      hasBackupYoutube: Boolean(resolveBackupYoutubeId(event)),
    },
  });
});

/**
 * @route POST /api/events/:id/stream/emergency
 * @desc  Super Admin emergency failover controls
 * @access Private (platform admin)
 * Body: { action: force_server|force_youtube|override|disable|enable|continue_youtube|switch_server }
 */
export const emergencyStreamControl = asyncHandler(async (req, res) => {
  if (!env.failoverEnabled) {
    res.status(503);
    throw new Error('Stream failover is disabled (FAILOVER_ENABLED!=true)');
  }

  const event = await findEventOr404(req.params.id, res);
  if (!isPlatformAdmin(req.user)) {
    res.status(403);
    throw new Error('Only Super Admin can use emergency stream controls');
  }

  const action = req.body?.action;
  let patch;
  try {
    patch = applyEmergencyAction(event, action, {
      userId: req.user._id || req.user.id,
    });
  } catch (err) {
    res.status(400);
    throw err;
  }

  event.playbackMode = patch.playbackMode;
  event.backupStatus = patch.backupStatus;
  event.emergencyOverride = {
    ...(event.emergencyOverride?.toObject?.() || event.emergencyOverride || {}),
    ...patch.emergencyOverride,
  };
  event.streamHealth = {
    ...(event.streamHealth?.toObject?.() || event.streamHealth || {}),
    ...patch.streamHealth,
  };
  await event.save();

  const slice = publicFailoverSlice(event, { failoverEnabled: true });
  const io = req.app.get('io');
  if (io && slice) {
    const payload = { eventId: event.id, ...slice, transition: patch.transition };
    io.to(`event:${event.id}`).emit('stream:playback-mode', payload);
    if (slice.activeSource === 'youtube' && patch.transition === 'force_youtube') {
      io.to(`event:${event.id}`).emit('stream:failover', {
        ...payload,
        message: 'Emergency override: switching to backup stream...',
      });
    }
  }

  const isPublishing = await publishingStatusForEvent(event);
  res.status(200).json({
    success: true,
    data: {
      ...publicStreamConfig(event, { isPublishing }),
      transition: patch.transition,
      activeSource: resolveActiveSource(event, { failoverEnabled: true }),
    },
  });
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
 * @route GET /api/events/stream/youtube-forward
 * @desc  MediaMTX VPS hook asks whether to ffmpeg-forward this path to YouTube.
 *        Returns the RTMP target only when forward is enabled for the event.
 *        Never expose this without x-media-secret.
 * @access Media server (x-media-secret)
 */
export const youtubeForwardConfig = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const streamKey = parseMediaMtxPath(
    req.query.path || req.query.streamKey || req.body?.path || req.body?.streamKey || ''
  );
  if (!streamKey) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'missing_path' });
  }

  const event = await findEventByStreamKey(streamKey);
  if (!event) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'event_not_found' });
  }

  // Only forward when explicitly configured for simultaneous Server↔YouTube modes.
  const allowForward =
    Boolean(event.youtubeForwardEnabled) &&
    (event.streamingDestination === 'server_youtube' ||
      event.streamingDestination === 'youtube_server' ||
      (!event.streamingDestination && event.streamProvider === 'rtmp'));

  if (
    !allowForward ||
    event.streamingDestination === 'server' ||
    event.streamingDestination === 'youtube'
  ) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'forward_disabled' });
  }

  const ytKey = event.youtubeStreamKey || '';
  const ytUrl = event.youtubeRtmpUrl || DEFAULT_YOUTUBE_RTMP;
  const target = buildYoutubeForwardTarget(ytUrl, ytKey);
  if (!target) {
    // eslint-disable-next-line no-console
    console.info(
      `[forward] youtube disabled path=${streamKey} reason=missing_credentials hasKey=${Boolean(ytKey)}`
    );
    return res.status(200).json({ ok: true, enabled: false, reason: 'missing_credentials' });
  }

  // eslint-disable-next-line no-console
  console.info(`[forward] youtube enabled path=${streamKey} eventId=${event._id}`);
  return res.status(200).json({
    ok: true,
    enabled: true,
    eventId: String(event._id),
    rtmpUrl: ytUrl,
    // Key only over media-secret channel for VPS ffmpeg; never for browsers.
    streamKey: ytKey,
    target,
  });
});

/**
 * @route GET|POST /api/events/stream/facebook-forward
 * @desc  MediaMTX VPS hook asks whether to ffmpeg-forward this path to Facebook Live.
 * @access Media server (x-media-secret)
 */
export const facebookForwardConfig = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const streamKey = parseMediaMtxPath(
    req.query.path || req.query.streamKey || req.body?.path || req.body?.streamKey || ''
  );
  if (!streamKey) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'missing_path' });
  }

  const event = await findEventByStreamKey(streamKey);
  if (!event) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'event_not_found' });
  }

  if (!event.facebookForwardEnabled) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'forward_disabled' });
  }

  const dest = String(event.streamingDestination || '').toLowerCase();
  if (dest === 'youtube') {
    return res.status(200).json({ ok: true, enabled: false, reason: 'no_server_ingest' });
  }

  const fbKey = event.facebookStreamKey || '';
  const fbUrl = event.facebookRtmpUrl || DEFAULT_FACEBOOK_RTMP;
  const target = buildForwardTarget(fbUrl, fbKey, { fallbackUrl: DEFAULT_FACEBOOK_RTMP });
  if (!target) {
    // eslint-disable-next-line no-console
    console.info(
      `[forward] facebook disabled path=${streamKey} reason=missing_credentials hasKey=${Boolean(fbKey)}`
    );
    return res.status(200).json({ ok: true, enabled: false, reason: 'missing_credentials' });
  }

  // eslint-disable-next-line no-console
  console.info(`[forward] facebook enabled path=${streamKey} eventId=${event._id}`);
  return res.status(200).json({
    ok: true,
    enabled: true,
    eventId: String(event._id),
    rtmpUrl: fbUrl,
    streamKey: fbKey,
    target,
  });
});

/**
 * @route GET|POST /api/events/stream/forwards
 * @desc  Multi-destination RTMP forward config for MediaMTX (YouTube + Facebook).
 * @access Media server (x-media-secret)
 */
export const streamForwardsConfig = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const streamKey = parseMediaMtxPath(
    req.query.path || req.query.streamKey || req.body?.path || req.body?.streamKey || ''
  );
  if (!streamKey) {
    return res.status(200).json({ ok: true, enabled: false, targets: [], reason: 'missing_path' });
  }

  const event = await findEventByStreamKey(streamKey);
  if (!event) {
    return res.status(200).json({
      ok: true,
      enabled: false,
      targets: [],
      reason: 'event_not_found',
    });
  }

  const targets = listEnabledForwardTargets(event);
  const diagnostics = describeForwardEligibility(event);
  const reason = targets.length
    ? undefined
    : diagnostics.youtubeSkipReason ||
      diagnostics.facebookSkipReason ||
      'forward_disabled';

  // eslint-disable-next-line no-console
  console.info(
    `[forward] multi path=${streamKey} enabled=${targets.length > 0} targets=${targets
      .map((t) => t.id)
      .join(',') || 'none'} reason=${reason || 'ok'} dest=${diagnostics.streamingDestination} yt=${diagnostics.youtubeForwardEnabled}/${diagnostics.hasYoutubeStreamKey} fb=${diagnostics.facebookForwardEnabled}/${diagnostics.hasFacebookStreamKey}`
  );

  return res.status(200).json({
    ok: true,
    enabled: targets.length > 0,
    eventId: String(event._id),
    targets,
    reason,
    diagnostics,
  });
});

/**
 * @route GET|POST /api/events/stream/abr-config
 * @desc  MediaMTX VPS hook asks whether to start 2-quality ABR ffmpeg for this path.
 * @access Media server (x-media-secret)
 */
export const abrStreamConfig = asyncHandler(async (req, res) => {
  if (!mediaSecretOk(req)) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const streamKey = parseMediaMtxPath(
    req.query.path || req.query.streamKey || req.body?.path || req.body?.streamKey || ''
  );
  if (!streamKey) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'missing_path' });
  }

  const event = await findEventByStreamKey(streamKey);
  if (!event) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'event_not_found' });
  }

  const dest = String(event.streamingDestination || '').toLowerCase();
  if (dest === 'youtube') {
    return res.status(200).json({ ok: true, enabled: false, reason: 'youtube_only' });
  }
  // Website plays YouTube embed — no need for ABR ladder CPU on this path.
  if (dest === 'youtube_server') {
    return res.status(200).json({ ok: true, enabled: false, reason: 'youtube_embed_playback' });
  }

  if (!isAdaptiveStreamingEnabled(event)) {
    return res.status(200).json({ ok: true, enabled: false, reason: 'adaptive_off' });
  }

  // Server ingest required (rtmp/hls). YouTube-only has no MediaMTX publish.
  if (event.streamProvider !== 'rtmp' && event.streamProvider !== 'hls') {
    return res.status(200).json({ ok: true, enabled: false, reason: 'no_server_ingest' });
  }

  return res.status(200).json({
    ok: true,
    enabled: true,
    eventId: String(event._id),
    streamKey: resolveStreamKey(event),
  });
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

  clearOfflineTimer(event.id);
  clearMergeTimer(event.id);

  event.isLive = true;
  event.liveReconnecting = false;
  event.liveReconnectUntil = undefined;
  event.liveStartedAt = event.liveStartedAt || new Date();
  event.liveEndedAt = undefined;
  if (event.streamProvider === 'none') event.streamProvider = 'rtmp';
  const playbackUrl = buildOriginHlsPlaybackUrl(resolveStreamKey(event), event);
  if (playbackUrl) event.hlsUrl = playbackUrl;
  if (['draft', 'published', 'ended'].includes(event.status)) event.status = 'live';
  await event.save();

  const io = req.app.get('io');
  emitLiveStatus(io, event, { liveStartedAt: event.liveStartedAt });
  return res.status(200).json({ ok: true });
});

/**
 * @route POST /api/events/stream/stopped
 * @desc  Media server reports a publish ended.
 *        Short drops (<30s) keep the event live with reconnecting=true.
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

  const io = req.app.get('io');
  event.liveReconnecting = true;
  event.liveReconnectUntil = new Date(Date.now() + LIVE_RECONNECT_GRACE_MS);
  event.isLive = true;
  if (event.status === 'ended') event.status = 'live';
  await event.save();

  emitLiveStatus(io, event, { reconnecting: true, playbackMode: 'reconnecting' });

  scheduleOfflineTimer(event.id, LIVE_RECONNECT_GRACE_MS, async () => {
    await finalizeEventOffline(event.id, { io });
  });

  return res.status(200).json({ ok: true, reconnecting: true, graceMs: LIVE_RECONNECT_GRACE_MS });
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

  const io = req.app.get('io');
  const keepLive = Boolean(event.isLive) || isWithinReconnectGrace(event);

  if (keepLive) {
    // Mid-stream reconnect segment — register the part but do NOT flip offline.
    event.recordingMergeStatus = '';
    await event.save();
    emitLiveStatus(io, event);
  } else {
    event.isLive = false;
    event.liveReconnecting = false;
    event.liveReconnectUntil = undefined;
    event.liveEndedAt = event.liveEndedAt || new Date();
    if (event.status === 'live' || event.status === 'published' || event.status === 'draft') {
      event.status = 'ended';
    }
    await event.save();
    emitLiveStatus(io, event);
    scheduleRecordingMerge(event.id, io);
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
    keptLive: keepLive,
  });
});

/**
 * Upload the newest local recording part to R2, verify it, update that history
 * entry (prior parts untouched), then delete only that local VPS copy.
 */
async function uploadEventRecordingToR2(eventId) {
  const event = await Event.findById(eventId);
  if (!event) throw new Error('event not found');

  const parts = listActiveRecordingParts(event);
  const pending =
    parts
      .slice()
      .reverse()
      .find((p) => p.storage !== 'r2' || !p.r2Key) || null;

  const abs = resolveRecordingAbsolutePath(
    pending?.localPath || event.recordingPath
  );
  if (!abs || !fs.existsSync(abs)) {
    // Already migrated (e.g. race) — nothing to do.
    if (event.recordingStorage === 'r2' && event.recordingR2Key) return;
    throw new Error(`local recording missing: ${event.recordingPath}`);
  }

  const filename = path.basename(abs);
  const key = `recordings/${event.id}/${filename}`;
  console.log(`[r2] uploading ${abs} -> ${key}`);
  const { url, size } = await uploadRecordingToR2(abs, key);
  console.log(`[r2] upload verified (${size} bytes): ${url}`);

  markRecordingPartUploaded(event, {
    filename,
    localPath: abs,
    r2Key: key,
    r2Url: url,
    sizeBytes: size,
  });
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
 * @desc  Stream / redirect a recorded MP4 part (public within 30 days; admins always).
 *        Optional query: ?part=<recordingPartId> (defaults to Part 1 / oldest).
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
  // Public visitors: only publiclyVisible recordings.
  // Admins (admin/superadmin): may replay hidden/expired — no createdBy gate.
  if (!rec.publiclyVisible && !isAdmin) {
    res.status(404);
    throw new Error('Recording is not available');
  }

  const partId = String(req.query.part || '').trim();
  const part = resolveRecordingPartForPlayback(event, partId || undefined);
  if (partId && !part) {
    res.status(404);
    throw new Error('Recording part not found');
  }

  const r2Key = part?.storage === 'r2' ? part.r2Key : !part && rec.recordingR2Key ? rec.recordingR2Key : '';
  if (r2Key) {
    const target = await resolveR2BrowserUrl(r2Key);
    if (target) {
      return res.redirect(302, target);
    }
    // This API host cannot mint R2 URLs (e.g. Render without R2 env). Hand off to
    // the stream VPS which already has credentials — do not 500 the player.
    if (!isOnRecordingFallbackHost(req)) {
      const fallback = fallbackRecordingPlayUrl(event.id, part);
      if (fallback) return res.redirect(302, fallback);
    }
    res.status(500);
    throw new Error('R2 recording URL unavailable');
  }

  const abs = resolveRecordingAbsolutePath(part?.localPath || rec.recordingPath);
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
 * @desc  JSON play URL for one recording part (presigned R2 or same-origin API).
 *        Optional query: ?part=<recordingPartId>
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
  // Public visitors: only publiclyVisible recordings.
  // Admins (admin/superadmin): may replay hidden/expired — no createdBy gate.
  if (!rec.publiclyVisible && !isAdmin) {
    res.status(404);
    throw new Error('Recording is not available');
  }

  const partId = String(req.query.part || '').trim();
  const part = resolveRecordingPartForPlayback(event, partId || undefined);
  if (partId && !part) {
    res.status(404);
    throw new Error('Recording part not found');
  }

  const filename = part?.filename || rec.recordingFilename;
  const r2Key = part?.storage === 'r2' ? part.r2Key : !part && rec.recordingR2Key ? rec.recordingR2Key : '';

  if (r2Key) {
    const url = await resolveR2BrowserUrl(r2Key, { expiresIn: 6 * 3600 });
    if (url) {
      return res.status(200).json({
        success: true,
        data: {
          url,
          storage: 'r2',
          expiresInSec: r2PublicUrl(r2Key) ? null : 6 * 3600,
          filename,
          partId: part ? String(part._id || part.id || '') : '',
        },
      });
    }
    // Render (no R2 credentials): return the VPS recording play URL so <video> works.
    if (!isOnRecordingFallbackHost(req)) {
      const fallback = fallbackRecordingPlayUrl(event.id, part);
      if (fallback) {
        return res.status(200).json({
          success: true,
          data: {
            url: fallback,
            storage: 'r2',
            expiresInSec: null,
            filename,
            partId: part ? String(part._id || part.id || '') : '',
          },
        });
      }
    }
    res.status(500);
    throw new Error('R2 recording URL unavailable');
  }

  const apiOrigin = requestOrigin(req);
  const qs = part && (part._id || part.id) ? `?part=${part._id || part.id}` : '';
  return res.status(200).json({
    success: true,
    data: {
      url: `${apiOrigin}/api/events/${event.id}/stream/recording${qs}`,
      storage: 'local',
      expiresInSec: null,
      filename,
      partId: part ? String(part._id || part.id || '') : '',
    },
  });
});

/**
 * @route GET /api/events/:id/stream/recording/download
 * @desc  Download one recorded MP4 part (owner/admin). Query: ?part=<id>
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

  const partId = String(req.query.part || '').trim();
  const part = resolveRecordingPartForPlayback(event, partId || undefined);
  if (partId && !part) {
    res.status(404);
    throw new Error('Recording part not found');
  }

  const filename = part?.filename || rec.recordingFilename || `recording-${event.id}.mp4`;
  const r2Key = part?.storage === 'r2' ? part.r2Key : !part && rec.recordingR2Key ? rec.recordingR2Key : '';

  if (r2Key) {
    const target = await presignRecordingUrl(r2Key, {
      downloadFilename: filename,
    });
    if (!target) {
      res.status(500);
      throw new Error('R2 recording URL unavailable');
    }
    return res.redirect(302, target);
  }

  const abs = resolveRecordingAbsolutePath(part?.localPath || rec.recordingPath);
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
 * @desc  Permanently delete one recording part (?part=id) or all parts (?all=1).
 *        Deleting one part never removes other parts' R2 objects.
 * @access Private
 */
export const deleteRecordingPermanently = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const partId = String(req.query.part || req.body?.part || '').trim();
  const deleteAll = ['1', 'true', 'yes'].includes(
    String(req.query.all || req.body?.all || '').toLowerCase()
  );

  const unlinkLocal = (localPath) => {
    const abs = resolveRecordingAbsolutePath(localPath);
    if (abs && fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch {
        res.status(500);
        throw new Error('Failed to delete recording file');
      }
    }
  };

  const unlinkR2 = async (r2Key) => {
    if (!r2Key) return;
    try {
      await deleteRecordingFromR2(r2Key);
      console.log(`[r2] deleted object ${r2Key}`);
    } catch (err) {
      console.error(`[r2] failed to delete ${r2Key}: ${err.message}`);
      res.status(500);
      throw new Error('Failed to delete recording from R2');
    }
  };

  if (deleteAll) {
    const cleanup = clearAllRecordingFields(event);
    for (const item of cleanup) {
      unlinkLocal(item.localPath);
      await unlinkR2(item.r2Key);
    }
    // Also clean legacy pointer if somehow orphaned outside history.
    unlinkLocal(event.recordingPath);
    await unlinkR2(event.recordingR2Key);
    await event.save();
  } else {
    // Prefer explicit part id. If only one active part exists, allow omitting it.
    const parts = listActiveRecordingParts(event);
    const targetId = partId || (parts.length === 1 ? String(parts[0]._id || parts[0].id || '') : '');
    if (!targetId) {
      res.status(400);
      throw new Error('Specify ?part=<id> to delete one recording, or ?all=1 to delete all');
    }
    const cleanup = removeRecordingPart(event, targetId);
    if (!cleanup) {
      res.status(404);
      throw new Error('Recording part not found');
    }
    unlinkLocal(cleanup.localPath);
    await unlinkR2(cleanup.r2Key);
    await event.save();
  }

  const remaining = getRecordingState(event);
  const io = req.app.get('io');
  if (io) {
    io.to(`event:${event.id}`).emit('stream:status', {
      isLive: event.isLive,
      status: event.status,
      playbackMode: event.isLive ? 'live' : remaining.hasRecording ? 'recorded' : 'offline',
      recordingUrl: event.isLive ? '' : buildPublicRecordingUrl(event),
      recordingAvailable: !event.isLive && remaining.publiclyVisible,
      recordingCount: remaining.recordingCount,
    });
  }

  res.status(200).json({
    success: true,
    data: {
      deleted: true,
      remaining: remaining.recordingCount,
      ...adminRecordingConfig(event),
    },
  });
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
