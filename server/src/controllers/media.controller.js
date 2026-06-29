import fs from 'fs';
import path from 'path';
import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent } from '../utils/ownership.js';
import { UPLOADS_DIR, uploadedFileUrl } from '../middleware/upload.middleware.js';

async function findEventOr404(id, res) {
  const event = await Event.findById(id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  return event;
}

/** Best-effort removal of a locally-stored upload (ignores anything external). */
function removeLocalUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.promises.unlink(filePath).catch(() => {});
}

/**
 * @route POST /api/events/:id/gallery
 * @desc  Upload one or more photos to an event gallery (owner/admin)
 * @access Private
 */
export const uploadGallery = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const files = req.files || [];
  if (files.length === 0) {
    res.status(400);
    throw new Error('No images were uploaded');
  }

  const captions = Array.isArray(req.body.captions)
    ? req.body.captions
    : [req.body.captions].filter(Boolean);

  files.forEach((file, i) => {
    event.gallery.push({ url: uploadedFileUrl(file), caption: captions[i] || '' });
  });
  await event.save();

  res.status(201).json({ success: true, data: event.gallery });
});

/**
 * @route DELETE /api/events/:id/gallery/:photoId
 * @desc  Remove a photo from the gallery (owner/admin)
 * @access Private
 */
export const deleteGalleryPhoto = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const photo = event.gallery.id(req.params.photoId);
  if (!photo) {
    res.status(404);
    throw new Error('Photo not found');
  }

  removeLocalUpload(photo.url);
  photo.deleteOne();
  await event.save();

  res.status(200).json({ success: true, data: event.gallery });
});

/**
 * @route POST /api/events/:id/logo
 * @desc  Upload / replace the photography logo (owner/admin)
 * @access Private
 */
export const uploadLogo = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  if (!req.file) {
    res.status(400);
    throw new Error('No logo image was uploaded');
  }

  if (event.photographerLogo) removeLocalUpload(event.photographerLogo);
  event.photographerLogo = uploadedFileUrl(req.file);
  await event.save();

  res.status(201).json({ success: true, data: { photographerLogo: event.photographerLogo } });
});
