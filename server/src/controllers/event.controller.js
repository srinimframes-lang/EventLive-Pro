import mongoose from 'mongoose';
import { Event, EVENT_STATUSES, EVENT_CATEGORIES } from '../models/Event.js';
import { Domain } from '../models/Domain.js';
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
import { syncEventQrCode } from '../utils/eventQr.js';
import { loadVerifiedEvent, scheduleEventQrSync } from '../utils/eventSave.js';
import {
  applyStreamTypeSelection,
  resolveStreamType,
  validateOnlineStreamPayload,
} from '../utils/streamType.js';
import { freshServerStreamUrls } from '../utils/mediaStream.js';

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
];

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
 * Throws a 403 unless the user may manage this event: the Super Admin can
 * manage any event; anyone else can manage only events they created.
 */
function assertCanModify(event, user, res) {
  const isAdmin = user.role === 'admin';
  const isOwner = event.organizer?.toString() === user._id.toString();
  if (!isAdmin && !isOwner) {
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
    'createdAt',
  ].join(' ');

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

  res.status(200).json({
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data,
  });
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

  const event = await Event.findOne(query).populate('organizer', 'name email');

  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  // White-label: surface the organizer's active custom domain so share/watch
  // links can be built on it (falls back to the platform domain when absent).
  const data = event.toJSON();

  const streamUrls = freshServerStreamUrls(event);
  if (streamUrls) {
    // Public watch must never receive the full RTMP publish URL (it embeds the
    // stream key). Hosts fetch ingest credentials via GET /stream/key.
    data.hlsUrl = streamUrls.playbackUrl;
  }
  delete data.rtmpPublishUrl;
  delete data.rtmpStreamKey;

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
    const dom = await Domain.findOne({ customer: organizerId, status: 'active' })
      .select('host')
      .lean();
    data.brandDomain = dom ? dom.host : '';
  }

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

  try {
    // ── Admin: unlimited, no credits consumed ───────────────────────────
    if (role === 'admin') {
      payload.organizer = req.body.organizer || req.user._id;
      payload.creditType = 'none';
      const event = await Event.create(payload);
      const populated = await loadVerifiedEvent(event._id);
      scheduleEventQrSync(event._id);
      // eslint-disable-next-line no-console
      console.info(`[events] created admin user=${userId} id=${event._id} shortCode=${event.shortCode}`);
      return res.status(201).json({ success: true, data: populated });
    }

    // ── Everyone else: pay with credits (YouTube = 1, Server = 5) ────────
    const linkType = streamType || (req.body.linkType === 'server' ? 'server' : 'youtube');
    const cost = linkCost(linkType);
    payload.organizer = req.user._id;
    payload.creditType = linkType;

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

    const populated = await loadVerifiedEvent(event._id);
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
  const event = await Event.findById(req.params.id);
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

  try {
    await event.save();
    const populated = await loadVerifiedEvent(event._id);
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
