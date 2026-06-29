import mongoose from 'mongoose';
import { Event, EVENT_STATUSES, EVENT_CATEGORIES } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changeBalance } from '../utils/credits.js';
import { linkCost } from '../config/credits.js';

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
  'photographerName',
  'photographerLogo',
  'streamProvider',
  'youtubeVideoId',
  'hlsUrl',
  'webrtcUrl',
  'chatEnabled',
];

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
  if (req.query.search) {
    filter.$text = { $search: req.query.search };
  }

  const sort = req.query.sort === 'startTime' ? { startTime: 1 } : { createdAt: -1 };

  const [items, total] = await Promise.all([
    Event.find(filter)
      .populate('organizer', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Event.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: items.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: items,
  });
});

/**
 * @route   GET /api/events/:idOrSlug
 * @desc    Get a single event by id or slug
 * @access  Public
 */
export const getEvent = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const query = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };

  const event = await Event.findOne(query).populate('organizer', 'name email');

  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  res.status(200).json({ success: true, data: event });
});

/**
 * @route   POST /api/events
 * @desc    Create a new event (authenticated user becomes the organizer)
 * @access  Private
 */
export const createEvent = asyncHandler(async (req, res) => {
  const role = req.user.role;

  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  }
  payload.createdByRole = role;

  // ── Admin: unlimited, no credits consumed ───────────────────────────
  if (role === 'admin') {
    payload.organizer = req.body.organizer || req.user._id;
    payload.creditType = 'none';
    const event = await Event.create(payload);
    const populated = await event.populate('organizer', 'name email');
    return res.status(201).json({ success: true, data: populated });
  }

  // ── Everyone else: pay with credits (YouTube = 1, Server = 5) ────────
  const linkType = req.body.linkType === 'server' ? 'server' : 'youtube';
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

  // Create the event; refund the credits if persistence fails.
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

  const populated = await event.populate('organizer', 'name email');
  return res.status(201).json({
    success: true,
    data: populated,
    creditBalance: updated.creditBalance,
  });
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

  await event.save();
  const populated = await event.populate('organizer', 'name email');

  res.status(200).json({ success: true, data: populated });
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
