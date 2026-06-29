import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent } from '../utils/ownership.js';
import { persistUpload, removeUpload } from '../utils/storage.js';

async function findEventOr404(id, res) {
  const event = await Event.findById(id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  return event;
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

  const urls = await Promise.all(files.map((file) => persistUpload(file)));
  urls.forEach((url, i) => {
    event.gallery.push({ url, caption: captions[i] || '' });
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

  await removeUpload(photo.url);
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

  if (event.photographerLogo) await removeUpload(event.photographerLogo);
  event.photographerLogo = await persistUpload(req.file);
  await event.save();

  res.status(201).json({ success: true, data: { photographerLogo: event.photographerLogo } });
});

/**
 * @route POST /api/events/:id/cover
 * @desc  Upload / replace the couple (cover) photo (owner/admin)
 * @access Private
 */
export const uploadCover = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }

  if (event.coverImage) await removeUpload(event.coverImage);
  event.coverImage = await persistUpload(req.file);
  await event.save();

  res.status(201).json({ success: true, data: { coverImage: event.coverImage } });
});
