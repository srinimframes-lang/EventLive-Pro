import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertCanManageEvent } from '../utils/ownership.js';
import { persistUpload, removeUpload } from '../utils/storage.js';
import {
  deleteR2Object,
  isR2Configured,
  presignR2Url,
  r2PublicUrl,
  uploadFileToR2,
} from '../utils/r2.js';

async function findEventOr404(id, res) {
  const event = await Event.findById(id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  return event;
}

function sortGallery(gallery = []) {
  return [...gallery].sort((a, b) => {
    const ao = Number(a.order ?? 0);
    const bo = Number(b.order ?? 0);
    if (ao !== bo) return ao - bo;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  });
}

function galleryApiImagePath(eventId, photoId) {
  return `/api/events/${eventId}/gallery/${photoId}/image`;
}

function safeExt(originalname = '', mimetype = '') {
  const fromName = path.extname(originalname).toLowerCase().slice(0, 10);
  if (fromName && /^\.(jpe?g|png|webp|gif)$/i.test(fromName)) return fromName;
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'image/gif') return '.gif';
  return '.jpg';
}

async function removeGalleryAsset(photo) {
  if (photo?.r2Key) {
    try {
      await deleteR2Object(photo.r2Key);
    } catch (err) {
      console.error(`[gallery] R2 delete failed for ${photo.r2Key}:`, err.message);
    }
    return;
  }
  if (photo?.url) await removeUpload(photo.url);
}

/**
 * Attach fresh display URLs for R2-backed gallery photos (presigned or public).
 * Legacy Cloudinary/local URLs are left unchanged.
 */
export async function hydrateGalleryUrls(eventLike, { expiresIn = 6 * 3600, directUrlLimit = 48 } = {}) {
  if (!eventLike?.gallery?.length) return eventLike?.gallery || [];
  const eventId = eventLike.id || eventLike._id;
  const sorted = sortGallery(eventLike.gallery);

  return Promise.all(
    sorted.map(async (photo, index) => {
      const plain = typeof photo.toObject === 'function' ? photo.toObject() : { ...photo };
      const id = String(plain.id || plain._id || '');
      if (plain.r2Key) {
        // Beyond the first N photos, use the durable redirect path so we do not
        // burn CPU signing hundreds of URLs on every watch-page load.
        if (Number.isFinite(directUrlLimit) && index >= directUrlLimit) {
          plain.url = galleryApiImagePath(eventId, id);
        } else {
          const publicUrl = r2PublicUrl(plain.r2Key);
          const signed = publicUrl || (await presignR2Url(plain.r2Key, { expiresIn }));
          plain.url = signed || galleryApiImagePath(eventId, id);
        }
      }
      plain.id = id;
      return plain;
    })
  );
}

/**
 * @route POST /api/events/:id/gallery
 * @desc  Upload one or more photos to an event gallery (owner/admin) → Cloudflare R2
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

  const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const invalid = files.filter((f) => !allowedMime.has(f.mimetype));
  if (invalid.length > 0) {
    files.forEach((f) => {
      try {
        fs.unlinkSync(f.path);
      } catch {
        /* ignore */
      }
    });
    res.status(400);
    throw new Error('Gallery photos must be JPG, JPEG, PNG, or WebP');
  }

  if (!isR2Configured()) {
    // Clean temp uploads then fail — gallery must use R2, not VPS disk.
    files.forEach((f) => {
      try {
        fs.unlinkSync(f.path);
      } catch {
        /* ignore */
      }
    });
    res.status(503);
    throw new Error('Cloudflare R2 is not configured for gallery uploads');
  }

  const captions = Array.isArray(req.body.captions)
    ? req.body.captions
    : [req.body.captions].filter(Boolean);

  let nextOrder =
    event.gallery.reduce((max, p) => Math.max(max, Number(p.order) || 0), -1) + 1;

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const ext = safeExt(file.originalname, file.mimetype);
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const key = `galleries/${event.id}/${unique}`;

    try {
      await uploadFileToR2(file.path, key, file.mimetype || 'image/jpeg');
    } finally {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }

    const photo = event.gallery.create({
      url: galleryApiImagePath(event.id, 'pending'),
      r2Key: key,
      filename: file.originalname || unique,
      caption: captions[i] || '',
      order: nextOrder,
      isCover: false,
    });
    nextOrder += 1;
    event.gallery.push(photo);
    photo.url = galleryApiImagePath(event.id, photo.id);
  }

  await event.save();
  const gallery = await hydrateGalleryUrls(event);
  res.status(201).json({
    success: true,
    data: gallery,
    meta: { count: gallery.length },
  });
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

  await removeGalleryAsset(photo);
  photo.deleteOne();
  await event.save();

  const gallery = await hydrateGalleryUrls(event);
  res.status(200).json({ success: true, data: gallery, meta: { count: gallery.length } });
});

/**
 * @route POST /api/events/:id/gallery/delete
 * @desc  Delete multiple gallery photos (owner/admin)
 * @access Private
 */
export const deleteGalleryPhotos = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const ids = Array.isArray(req.body?.photoIds)
    ? req.body.photoIds.map((id) => String(id)).filter(Boolean)
    : [];
  if (ids.length === 0) {
    res.status(400);
    throw new Error('photoIds array is required');
  }

  for (const id of ids) {
    const photo = event.gallery.id(id);
    if (!photo) continue;
    await removeGalleryAsset(photo);
    photo.deleteOne();
  }
  await event.save();

  const gallery = await hydrateGalleryUrls(event);
  res.status(200).json({ success: true, data: gallery, meta: { count: gallery.length } });
});

/**
 * @route PATCH /api/events/:id/gallery/reorder
 * @desc  Reorder gallery photos. Body: { photoIds: string[] } in display order.
 * @access Private
 */
export const reorderGallery = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const ids = Array.isArray(req.body?.photoIds)
    ? req.body.photoIds.map((id) => String(id)).filter(Boolean)
    : [];
  if (ids.length === 0) {
    res.status(400);
    throw new Error('photoIds array is required');
  }

  const byId = new Map(event.gallery.map((p) => [String(p.id), p]));
  ids.forEach((id, index) => {
    const photo = byId.get(id);
    if (photo) photo.order = index;
  });

  // Any photos not listed keep relative order after the listed ones.
  let cursor = ids.length;
  sortGallery(event.gallery).forEach((p) => {
    if (!ids.includes(String(p.id))) {
      p.order = cursor;
      cursor += 1;
    }
  });

  await event.save();
  const gallery = await hydrateGalleryUrls(event);
  res.status(200).json({ success: true, data: gallery, meta: { count: gallery.length } });
});

/**
 * @route POST /api/events/:id/gallery/:photoId/cover
 * @desc  Mark a gallery photo as the gallery cover (and sync event.coverImage display URL).
 * @access Private
 */
export const setGalleryCover = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  assertCanManageEvent(event, req.user, res);

  const photo = event.gallery.id(req.params.photoId);
  if (!photo) {
    res.status(404);
    throw new Error('Photo not found');
  }

  event.gallery.forEach((p) => {
    p.isCover = String(p.id) === String(photo.id);
  });

  // Prefer a durable API path for coverImage so it stays valid after presign expiry.
  event.coverImage = galleryApiImagePath(event.id, photo.id);
  await event.save();

  const gallery = await hydrateGalleryUrls(event);
  res.status(200).json({
    success: true,
    data: { gallery, coverImage: event.coverImage, coverPhotoId: photo.id },
  });
});

/**
 * @route GET /api/events/:id/gallery/:photoId/image
 * @desc  Redirect to a fresh R2 (or legacy) image URL for <img> tags.
 * @access Public
 */
export const playGalleryImage = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id, res);
  const photo = event.gallery.id(req.params.photoId);
  if (!photo) {
    res.status(404);
    throw new Error('Photo not found');
  }

  if (photo.r2Key) {
    const publicUrl = r2PublicUrl(photo.r2Key);
    const target = publicUrl || (await presignR2Url(photo.r2Key, { expiresIn: 6 * 3600 }));
    if (!target) {
      res.status(500);
      throw new Error('Gallery image URL unavailable');
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.redirect(302, target);
  }

  // Legacy Cloudinary / absolute URL
  if (/^https?:\/\//i.test(photo.url)) {
    return res.redirect(302, photo.url);
  }

  // Legacy local /uploads path — serve from disk via redirect to static.
  if (photo.url.startsWith('/uploads/')) {
    return res.redirect(302, photo.url);
  }

  res.status(404);
  throw new Error('Photo file missing');
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
