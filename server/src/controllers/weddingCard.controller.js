import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { persistUpload } from '../utils/storage.js';
import { resolveEventCreateOwners } from '../utils/ownership.js';
import { recognizeWeddingCardImage } from '../utils/weddingCardOcr.js';
import {
  buildWeddingEventTitle,
  parseWeddingCardText,
} from '../utils/weddingCardExtract.js';
import { removeTempUpload } from '../middleware/weddingCardUpload.middleware.js';

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

/**
 * @route   POST /api/events/wedding-card/extract
 * @desc    OCR a wedding invitation image and return editable fields. Does not save.
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
  res.status(200).json({
    success: true,
    data: {
      ...fields,
      ocrStatus,
    },
  });
});

/**
 * @route   POST /api/events/wedding-card/confirm
 * @desc    Save reviewed wedding details as a draft event. No YouTube / live link.
 * @access  Private
 */
export const confirmWeddingCard = asyncHandler(async (req, res) => {
  const brideName = field(req.body, 'brideName').slice(0, 80);
  const groomName = field(req.body, 'groomName').slice(0, 80);
  const venue = field(req.body, 'venue').slice(0, 200);
  const weddingDate = field(req.body, 'weddingDate');
  const weddingTime = field(req.body, 'weddingTime');
  const eventTitle = buildWeddingEventTitle({
    eventTitle: field(req.body, 'eventTitle') || field(req.body, 'title'),
    brideName,
    groomName,
  });

  if (eventTitle.length < 3) {
    removeTempUpload(req.file);
    res.status(400);
    throw new Error('Please enter an event title (at least 3 characters)');
  }
  if (!groomName && !brideName) {
    removeTempUpload(req.file);
    res.status(400);
    throw new Error('Please enter the bride or groom name');
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
  const event = await Event.create({
    title: eventTitle,
    brideName,
    groomName,
    venue,
    location: venue || 'Online',
    startTime,
    endTime,
    category: 'wedding',
    status: 'draft',
    isOnline: true,
    streamProvider: 'none',
    creditType: 'none',
    source: 'wedding-card',
    coverImage,
    organizer: owners.organizer,
    createdBy: owners.createdBy,
    createdByRole: req.user.role,
    description: '',
  });

  const data = event.toJSON();
  if (data._id && data.id == null) data.id = String(data._id);

  res.status(201).json({
    success: true,
    data,
  });
});
