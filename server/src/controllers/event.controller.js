import mongoose from 'mongoose';
import { Event, EVENT_STATUSES, EVENT_CATEGORIES } from '../models/Event.js';
import { Theme } from '../models/Theme.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changeBalance } from '../utils/credits.js';
import { linkCost } from '../config/credits.js';
import { snapshotTheme } from '../controllers/theme.controller.js';
import { regionFromDistrictSlug } from '../constants/districts.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  normalizeStudioFields,
} from '../utils/studioFields.js';
import { syncEventQrCode, resolveEventBrandDomain } from '../utils/eventQr.js';
import { loadVerifiedEvent, scheduleEventQrSync } from '../utils/eventSave.js';
import {
  applyStreamTypeSelection,
  resolveStreamType,
  validateOnlineStreamPayload,
  streamTypeFromEvent,
} from '../utils/streamType.js';
import { applyYoutubeForwardFields, sanitizeStreamingSecrets } from '../utils/youtubeForward.js';
import { applyFacebookForwardFields } from '../utils/streamForward.js';
import { freshServerStreamUrls } from '../utils/mediaStream.js';
import { canManageEvent } from '../utils/ownership.js';
import { createdByFilter, isAdminPanelUser } from '../utils/tenantScope.js';
import { cacheGet, cacheSet } from '../utils/apiCache.js';

const EDITABLE_FIELDS = [
  'title',
  'description',
  'category',
  'status',
  'startTime',
  'endTime',
  'location',
  'venue',
  'isOnline',
  'streamUrl',
  'coverImage',
  'capacity',
  'tags',
  'brideName',
  'groomName',
  'pageTemplate',
  'heroBackgroundImage',
  'bridePhoto',
  'groomPhoto',
  'studioName',
  'photographerName',
  'photographerLogo',
  'studioPhone',
  'studioWhatsapp',
  'studioEmail',
  'studioWebsite',
  'studioInstagram',
  'studioFacebook',
  'studioYoutube',
  'studioMapsUrl',
  'streamProvider',
  'youtubeVideoId',
  'hlsUrl',
  'webrtcUrl',
  'chatEnabled',
  'streamingDestination',
  'youtubeRtmpUrl',
  'youtubeForwardEnabled',
  'facebookRtmpUrl',
  'facebookForwardEnabled',
];

function applyAdaptiveStreamingField(target, body, user, { isCreate = false } = {}) {
  // Super Admin only may enable Adaptive (Premium) ABR. Everyone else stays Standard.
  // On update, non–super-admins omit the field so existing events are unchanged.
  if (user?.role === 'superadmin') {
    if (body.adaptiveStreaming !== undefined) {
      target.adaptiveStreaming = Boolean(body.adaptiveStreaming);
    } else if (isCreate) {
      target.adaptiveStreaming = false;
    }
    return;
  }
  if (isCreate) {
    target.adaptiveStreaming = false;
  }
}

async function decorateEventResponse(eventDoc) {
  const plain = eventDoc?.toJSON ? eventDoc.toJSON() : { ...eventDoc };
  if (plain._id && plain.id == null) plain.id = String(plain._id);
  const id = plain.id || plain._id;
  let hasYtKey = false;
  let hasFbKey = false;
  if (id) {
    const keyed = await Event.findById(id)
      .select('+youtubeStreamKey +facebookStreamKey')
      .lean();
    hasYtKey = Boolean(keyed?.youtubeStreamKey);
    hasFbKey = Boolean(keyed?.facebookStreamKey);
  }
  sanitizeStreamingSecrets(plain, {
    hasYoutubeStreamKey: hasYtKey,
    hasFacebookStreamKey: hasFbKey,
  });
  if (!plain.streamingDestination) {
    plain.streamingDestination = streamTypeFromEvent(plain);
  }
  return plain;
}

/**
 * Normalize + validate backup stream fields for Premium Server events only.
 * Existing YouTube-primary events are left untouched.
 */
function applyBackupStreamFields(target, body, res) {
  if (body.backupStreamEnabled === undefined && body.backupYoutubeVideoId === undefined) {
    return;
  }

  const provider = target.streamProvider || body.streamProvider;
  const isServer = provider === 'rtmp' || provider === 'hls';
  if (!isServer) {
    // Do not attach backup config to YouTube / non-server events.
    return;
  }

  if (body.backupStreamEnabled !== undefined) {
    target.backupStreamEnabled = Boolean(body.backupStreamEnabled);
  }
  if (body.backupYoutubeVideoId !== undefined) {
    const raw = String(body.backupYoutubeVideoId || '').trim();
    const id = extractYouTubeId(raw);
    if (raw && !id) {
      res.status(400);
      throw new Error('Invalid backup YouTube Video ID');
    }
    target.backupYoutubeVideoId = id;
  }

  if (target.backupStreamEnabled) {
    const id = extractYouTubeId(target.backupYoutubeVideoId || '');
    if (!id) {
      res.status(400);
      throw new Error('Backup YouTube Video ID is required when Backup Stream is enabled');
    }
    target.backupYoutubeVideoId = id;
    if (!target.backupStatus || target.backupStatus === 'idle') {
      target.backupStatus = 'monitoring';
    }
    target.primaryStream = 'server';
  } else if (target.backupStreamEnabled === false && target.backupStatus !== 'disabled') {
    target.backupStatus = 'idle';
  }
}

/** Apply theme selection: stores ref + frozen snapshot so catalog edits never affect live pages. */
async function applyThemeSelection(target, themeId, res) {
  const id = themeId === undefined ? undefined : String(themeId || '').trim();
  if (id === undefined) return;
  if (!id) {
    target.theme = null;
    target.themeSnapshot = {
      name: '',
      category: '',
      region: '',
      backgroundImage: '',
      layoutVariant: 'royal-palace',
      heroLabel: '',
      footerText: '',
      isPremium: false,
      colors: {},
      fonts: {},
      style: {},
    };
    if (target.markModified) target.markModified('themeSnapshot');
    return;
  }
  const snap = await snapshotTheme(id);
  if (!snap) {
    res.status(400);
    throw new Error('Theme not found or inactive');
  }
  target.theme = id;
  target.themeSnapshot = snap;
  if (target.markModified) target.markModified('themeSnapshot');
}

/**
 * Throws a 403 unless the user may manage this event.
 */
function assertCanModify(event, user, res) {
  if (!canManageEvent(event, user)) {
    res.status(403);
    throw new Error('You do not have permission to manage this event');
  }
}

/**
 * @route   GET /api/events
 * @desc    List events with pagination, filtering and search
 * @access  Public
 * @query   page, limit, status, category, search, organizer, sort, mine
 */
export const listEvents = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.status && EVENT_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.category && EVENT_CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }
  if (req.query.organizer && mongoose.isValidObjectId(req.query.organizer)) {
    filter.organizer = req.query.organizer;
  }
  // `mine=true` scopes results to the authenticated organizer.
  if (req.query.mine === 'true' && req.user) {
    filter.organizer = req.user._id;
  }
  // Tenant isolation for admin dashboards ONLY (explicit adminScope).
  // Never apply createdBy filters on public catalogs or playback lookups.
  if (req.query.adminScope === 'true' && req.user && isAdminPanelUser(req.user)) {
    Object.assign(filter, createdByFilter(req.user));
  }
  if (req.query.public === 'true') {
    filter.status = { $in: ['published', 'live', 'ended'] };
  }
  if (req.query.district) {
    const region = regionFromDistrictSlug(String(req.query.district));
    if (region) filter['themeSnapshot.region'] = region;
  }
  if (req.query.search) {
    filter.$text = { $search: req.query.search };
  }

  const sort = req.query.sort === 'startTime' ? { startTime: 1 } : { createdAt: -1 };

  // Card/list projections — omit heavy gallery blobs and recording file paths.
  const listSelect = [
    'title',
    'slug',
    'shortCode',
    'category',
    'status',
    'isLive',
    'startTime',
    'endTime',
    'venue',
    'coverImage',
    'brideName',
    'groomName',
    'organizer',
    'streamProvider',
    'creditType',
    'themeSnapshot.name',
    'themeSnapshot.category',
    'themeSnapshot.region',
    'themeSnapshot.previewImage',
    'recordingStorage',
    'recordingPublicUntil',
    'recordingHidden',
    'createdBy',
    'createdAt',
  ].join(' ');

  const publicCacheable =
    !req.user &&
    req.query.mine !== 'true' &&
    req.query.adminScope !== 'true' &&
    !req.query.search &&
    !req.query.organizer;
  const publicCacheKey = publicCacheable
    ? `events:list:${page}:${limit}:${req.query.status || ''}:${req.query.category || ''}:${req.query.public || ''}:${req.query.district || ''}:${req.query.sort || ''}`
    : null;
  if (publicCacheKey) {
    const cached = cacheGet(publicCacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=20');
      return res.status(200).json(cached);
    }
  }

  const [items, total] = await Promise.all([
    Event.find(filter)
      .select(listSelect)
      .populate('organizer', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Event.countDocuments(filter),
  ]);

  const data = items.map((doc) => {
    const id = String(doc._id);
    return { ...doc, id, _id: undefined };
  });

  const payload = {
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data,
  };
  if (publicCacheKey) {
    cacheSet(publicCacheKey, payload, 20_000);
    res.set('Cache-Control', 'public, max-age=20');
  }
  res.status(200).json(payload);
});

/**
 * @route   GET /api/events/:idOrSlug
 * @desc    Get a single event by id or slug
 * @access  Public
 */
export const getEvent = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const raw = String(idOrSlug || '');
  // Resolve by Mongo id, short code (case-insensitive), or legacy slug.
  const query = mongoose.isValidObjectId(raw)
    ? { _id: raw }
    : { $or: [{ shortCode: raw.toUpperCase() }, { slug: raw.toLowerCase() }, { slug: raw }] };

  const event = await Event.findOne(query)
    .populate('organizer', 'name email')
    .lean({ virtuals: true });

  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  // White-label: surface the organizer's active custom domain so share/watch
  // links can be built on it (falls back to the platform domain when absent).
  const data = { ...event };
  if (data._id && data.id == null) data.id = String(data._id);
  delete data.__v;

  const streamUrls = freshServerStreamUrls(event);
  if (streamUrls) {
    // Public watch must never receive the full RTMP publish URL (it embeds the
    // stream key). Hosts fetch ingest credentials via GET /stream/key.
    data.hlsUrl = streamUrls.playbackUrl;
  }
  delete data.rtmpPublishUrl;
  delete data.rtmpStreamKey;
  delete data.youtubeStreamKey;
  delete data.facebookStreamKey;
  {
    const keyed = await Event.findById(event._id)
      .select('+youtubeStreamKey +facebookStreamKey')
      .lean();
    data.youtubeStreamKeySet = Boolean(keyed?.youtubeStreamKey);
    data.facebookStreamKeySet = Boolean(keyed?.facebookStreamKey);
  }
  if (!data.streamingDestination) {
    data.streamingDestination = streamTypeFromEvent(data);
  }

  // Fresh R2 (or legacy) display URLs for gallery images.
  try {
    const { hydrateGalleryUrls } = await import('./media.controller.js');
    data.gallery = await hydrateGalleryUrls(data);
  } catch {
    /* keep stored gallery urls */
  }

  // Repair: theme ref saved but snapshot missing (legacy bug) — backfill once.
  if (data.theme && !data.themeSnapshot?.name) {
    const theme = await Theme.findById(data.theme);
    if (theme) data.themeSnapshot = theme.toSnapshot();
  }

  const organizerId = event.organizer?._id || event.organizer;
  if (organizerId) {
    data.brandDomain = await resolveEventBrandDomain(organizerId);
    // Embed page: hide EventLivePro logo when WL domain is active or Super Admin
    // enabled disableBranding on the customer.
    try {
      const { User } = await import('../models/User.js');
      const owner = await User.findById(organizerId).select('branding.disableBranding').lean();
      data.embedHidePlatformLogo =
        Boolean(data.brandDomain) || Boolean(owner?.branding?.disableBranding);
    } catch {
      data.embedHidePlatformLogo = Boolean(data.brandDomain);
    }
  } else {
    data.embedHidePlatformLogo = false;
  }

  res.set('Cache-Control', 'public, max-age=10');
  res.status(200).json({ success: true, data });
});

/**
 * @route   POST /api/events
 * @desc    Create a new event (authenticated user becomes the organizer)
 * @access  Private
 */
export const createEvent = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const userId = req.user._id?.toString();

  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  }
  normalizeStudioFields(payload);
  if (payload.youtubeVideoId !== undefined) {
    payload.youtubeVideoId = extractYouTubeId(payload.youtubeVideoId) || String(payload.youtubeVideoId || '').trim();
  }
  payload.createdByRole = role;
  const themeId = req.body.theme ?? payload.theme;
  await applyThemeSelection(payload, themeId, res);

  const streamType = resolveStreamType(req.body, payload);
  const streamError = validateOnlineStreamPayload(payload, streamType);
  if (streamError) {
    res.status(400);
    throw new Error(streamError);
  }
  if (streamType) applyStreamTypeSelection(payload, streamType, { isCreate: true });
  const forwardErr = applyYoutubeForwardFields(payload, req.body, { isCreate: true });
  if (forwardErr) {
    res.status(400);
    throw new Error(forwardErr);
  }
  const fbForwardErr = applyFacebookForwardFields(payload, req.body, { isCreate: true });
  if (fbForwardErr) {
    res.status(400);
    throw new Error(fbForwardErr);
  }
  applyAdaptiveStreamingField(payload, req.body, req.user, { isCreate: true });
  applyBackupStreamFields(payload, req.body, res);

  try {
    // ── Admin / Super Admin: unlimited, no credits consumed ─────────────
    if (isAdminPanelUser(req.user)) {
      payload.organizer = req.body.organizer || req.user._id;
      payload.createdBy = req.user._id;
      payload.creditType = 'none';
      const event = await Event.create(payload);
      const populated = await decorateEventResponse(await loadVerifiedEvent(event._id));
      scheduleEventQrSync(event._id);
      // eslint-disable-next-line no-console
      console.info(`[events] created admin user=${userId} id=${event._id} shortCode=${event.shortCode}`);
      return res.status(201).json({ success: true, data: populated });
    }

    // ── Everyone else: pay with credits (YouTube = 1, Server / Simultaneous = 5) ────────
    const linkType = streamType || (req.body.linkType === 'server' ? 'server' : 'youtube');
    const cost = linkCost(
      linkType === 'server_youtube' || linkType === 'youtube_server' ? linkType : linkType
    );
    payload.organizer = req.user._id;
    // Tenant owner is the admin who created this customer/subadmin (if any).
    payload.createdBy = req.user.createdBy || null;
    payload.creditType =
      linkType === 'server_youtube' || linkType === 'youtube_server' ? 'server' : linkType;

    const updated = await changeBalance({
      userId: req.user._id,
      amount: -cost,
      reason: 'event_deduct',
      createdBy: req.user._id,
      note: `Create ${linkType} live link`,
    });
    if (!updated) {
      res.status(402); // Payment Required
      throw new Error(
        `You need ${cost} credit${cost > 1 ? 's' : ''} to create a ${linkType === 'server' ? 'Server' : 'YouTube'} live link. Please buy more credits.`
      );
    }

    let event;
    try {
      event = await Event.create(payload);
    } catch (err) {
      await changeBalance({
        userId: req.user._id,
        amount: cost,
        reason: 'refund',
        createdBy: req.user._id,
        note: 'Refund: link creation failed',
      });
      throw err;
    }

    const populated = await decorateEventResponse(await loadVerifiedEvent(event._id));
    scheduleEventQrSync(event._id);
    // eslint-disable-next-line no-console
    console.info(`[events] created user=${userId} id=${event._id} shortCode=${event.shortCode}`);
    return res.status(201).json({
      success: true,
      data: populated,
      creditBalance: updated.creditBalance,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[events] create failed user=${userId}:`, err.message);
    throw err;
  }
});

/**
 * @route   PATCH /api/events/:id
 * @desc    Update an event (owner or admin only)
 * @access  Private
 */
export const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).select('+youtubeStreamKey +facebookStreamKey');
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  assertCanModify(event, req.user, res);

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) event[field] = req.body[field];
  }
  normalizeStudioFields(event);
  if (req.body.youtubeVideoId !== undefined) {
    event.youtubeVideoId = extractYouTubeId(event.youtubeVideoId) || String(event.youtubeVideoId || '').trim();
  }
  if (req.body.theme !== undefined) {
    await applyThemeSelection(event, req.body.theme, res);
  }

  const streamType = resolveStreamType(req.body, event);
  const streamError = validateOnlineStreamPayload(
    { isOnline: event.isOnline, youtubeVideoId: event.youtubeVideoId, streamUrl: event.streamUrl },
    streamType
  );
  if (streamType) {
    if (streamError) {
      res.status(400);
      throw new Error(streamError);
    }
    applyStreamTypeSelection(event, streamType);
  }
  const forwardErr = applyYoutubeForwardFields(event, req.body, { isCreate: false });
  if (forwardErr) {
    res.status(400);
    throw new Error(forwardErr);
  }
  const fbForwardErr = applyFacebookForwardFields(event, req.body, { isCreate: false });
  if (fbForwardErr) {
    res.status(400);
    throw new Error(fbForwardErr);
  }
  applyAdaptiveStreamingField(event, req.body, req.user, { isCreate: false });
  applyBackupStreamFields(event, req.body, res);

  try {
    await event.save();
    const populated = await decorateEventResponse(await loadVerifiedEvent(event._id));
    scheduleEventQrSync(event._id);
    // eslint-disable-next-line no-console
    console.info(`[events] updated user=${req.user._id} id=${event._id}`);
    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[events] update failed id=${req.params.id} user=${req.user._id}:`, err.message);
    throw err;
  }
});

/**
 * @route POST /api/events/:id/qr/sync
 * @desc  Regenerate QR when the public live URL changed (owner/admin)
 * @access Private
 */
export const syncEventQr = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  assertCanModify(event, req.user, res);

  const result = await syncEventQrCode(event._id);
  if (!result) {
    res.status(400);
    throw new Error('Could not generate QR code for this event yet');
  }

  res.status(200).json({
    success: true,
    data: {
      qrCodeImage: result.qrCodeImage,
      qrCodeTargetUrl: result.targetUrl,
    },
  });
});

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete an event (owner or admin only)
 * @access  Private
 */
export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  assertCanModify(event, req.user, res);
  await event.deleteOne();

  res.status(200).json({ success: true, message: 'Event deleted', id: req.params.id });
});
