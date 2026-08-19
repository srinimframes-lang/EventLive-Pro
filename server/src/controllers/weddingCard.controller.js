import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { persistUpload } from '../utils/storage.js';
import { resolveEventCreateOwners, assertCanManageEvent } from '../utils/ownership.js';
import { recognizeWeddingCardImage } from '../utils/weddingCardOcr.js';
import {
  buildWedsTitle,
  isProvisionableCouplePair,
  isValidWeddingPersonName,
  normalizeWeddingPersonName,
  parseWeddingCardText,
} from '../utils/weddingCardExtract.js';
import { removeTempUpload } from '../middleware/weddingCardUpload.middleware.js';
import { applyStreamTypeSelection } from '../utils/streamType.js';
import { buildEventPublicWatchUrl } from '../utils/eventQr.js';
import { scheduleEventQrSync } from '../utils/eventSave.js';
import {
  eventHasYoutubeBroadcast,
  runWeddingCardYoutubeProvision,
  shouldRetryYoutubeProvision,
  weddingCardDuplicateFilter,
  weddingCardFingerprint,
  weddingCardLiveStatus,
} from '../utils/weddingCardProvision.js';

function field(body, key) {
  return String(body?.[key] ?? '').trim();
}

function combineStartTime(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  const time = String(timeStr || '').trim() || '10:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const start = new Date(`${date}T${time}`);
  if (Number.isNaN(start.getTime())) return null;
  return start;
}

async function publicWeddingCardPayload(event, extra = {}) {
  const live = weddingCardLiveStatus(event, extra);
  const liveUrl = await buildEventPublicWatchUrl(event);
  const json = event.toJSON ? event.toJSON() : { ...event };
  if (json._id && json.id == null) json.id = String(json._id);
  return {
    success: true,
    status: live.status,
    eventId: String(json.id || json._id),
    title: json.title || '',
    liveUrl,
    message: live.message,
    data: json,
  };
}

/**
 * @route   POST /api/events/wedding-card/extract
 * @desc    OCR a wedding invitation. Does not save. Title is generated from names only.
 * @access  Private
 */
export const extractWeddingCard = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a wedding card image (JPG, JPEG, PNG or WEBP)');
  }

  let rawText = '';
  let ocrStatus = 'ok';
  try {
    rawText = await recognizeWeddingCardImage(req.file.path);
    if (!rawText) ocrStatus = 'empty';
  } catch (err) {
    ocrStatus = 'failed';
    // eslint-disable-next-line no-console
    console.error('[wedding-card] OCR failed:', err.message);
  } finally {
    removeTempUpload(req.file);
  }

  const fields = parseWeddingCardText(rawText);
  const needsReview =
    !isValidWeddingPersonName(fields.groomName) ||
    !isValidWeddingPersonName(fields.brideName) ||
    !fields.weddingDate;

  res.status(200).json({
    success: true,
    data: {
      ...fields,
      eventTitle: buildWedsTitle(fields.groomName, fields.brideName),
      ocrStatus,
      needsReview,
    },
  });
});

/**
 * @route   POST /api/events/wedding-card/confirm
 * @desc    Save reviewed details, reuse existing YouTube provisioning, return live URL.
 * @access  Private
 */
export const confirmWeddingCard = asyncHandler(async (req, res) => {
  const groomName = normalizeWeddingPersonName(field(req.body, 'groomName'));
  const brideName = normalizeWeddingPersonName(field(req.body, 'brideName'));
  const venue = field(req.body, 'venue').slice(0, 200);
  const weddingDate = field(req.body, 'weddingDate');
  const weddingTime = field(req.body, 'weddingTime');
  const title = buildWedsTitle(groomName, brideName);

  if (!isProvisionableCouplePair(groomName, brideName) || !title) {
    removeTempUpload(req.file);
    res.status(400);
    throw new Error('Please review the wedding details before creating the live link.');
  }
  const startTime = combineStartTime(weddingDate, weddingTime);
  if (!startTime) {
    removeTempUpload(req.file);
    res.status(400);
    throw new Error('Please enter a valid wedding date and time');
  }
  const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

  let coverImage = '';
  try {
    if (req.file) coverImage = await persistUpload(req.file);
  } catch (err) {
    removeTempUpload(req.file);
    throw err;
  }

  const owners = resolveEventCreateOwners(req.user, req.body);
  const fingerprint = weddingCardFingerprint({
    organizerId: owners.organizer,
    groomName,
    brideName,
    weddingDate,
  });

  let event = await Event.findOne(weddingCardDuplicateFilter(owners.organizer, fingerprint)).select(
    '+youtubeStreamKey'
  );

  if (event && eventHasYoutubeBroadcast(event)) {
    event.youtubeProvisionStatus = 'ready';
    return res.status(200).json(await publicWeddingCardPayload(event));
  }

  const created = !event;
  const payload = {
    title,
    brideName,
    groomName,
    venue,
    location: venue || 'Online',
    startTime,
    endTime,
    category: 'wedding',
    status: 'published',
    isOnline: true,
    creditType: 'none',
    source: 'wedding-card',
    weddingCardFingerprint: fingerprint,
    youtubeProvisionStatus: 'pending',
    coverImage: coverImage || event?.coverImage || '',
    organizer: owners.organizer,
    createdBy: owners.createdBy,
    createdByRole: req.user.role,
    description: '',
  };
  applyStreamTypeSelection(payload, 'youtube', { isCreate: !event });
  payload.creditType = 'none';

  if (event) {
    event.title = title;
    event.brideName = brideName;
    event.groomName = groomName;
    event.venue = venue;
    event.location = venue || event.location || 'Online';
    event.startTime = startTime;
    event.endTime = endTime;
    if (coverImage) event.coverImage = coverImage;
    event.youtubeProvisionStatus = event.youtubeProvisionStatus || 'pending';
    applyStreamTypeSelection(event, 'youtube');
    event.creditType = 'none';
  } else {
    try {
      event = await Event.create(payload);
      event = await Event.findById(event._id).select('+youtubeStreamKey');
    } catch (err) {
      if (err.code === 11000) {
        event = await Event.findOne(
          weddingCardDuplicateFilter(owners.organizer, fingerprint)
        ).select('+youtubeStreamKey');
      } else {
        throw err;
      }
    }
  }

  if (!event) {
    res.status(500);
    throw new Error('Could not save the wedding details');
  }

  const { ingest, error } = await runWeddingCardYoutubeProvision(req.user, event);
  await event.save();
  scheduleEventQrSync(event._id);

  const body = await publicWeddingCardPayload(event, { ingest, error });
  res.status(created ? 201 : 200).json(body);
});

/**
 * @route   GET /api/events/wedding-card/:id/status
 * @desc    Poll live-link provisioning. Retries YouTube only when no broadcast exists.
 * @access  Private
 */
export const weddingCardStatus = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).select('+youtubeStreamKey');
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  assertCanManageEvent(event, req.user, res);

  if (shouldRetryYoutubeProvision(event)) {
    const { ingest, error } = await runWeddingCardYoutubeProvision(req.user, event);
    await event.save();
    return res.status(200).json(await publicWeddingCardPayload(event, { ingest, error }));
  }

  res.status(200).json(await publicWeddingCardPayload(event));
});
