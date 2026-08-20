/**
 * Public gallery image URLs. MongoDB stores a durable relative path (and r2Key).
 * The watch page must never receive private presigned R2/S3 URLs — those expire
 * and some mobile browsers fail to load r2.cloudflarestorage.com.
 */
import { r2PublicUrl } from './r2.js';

export function galleryApiImagePath(eventId, photoId) {
  const id = String(eventId || '').trim();
  const photo = String(photoId || '').trim();
  if (!id || !photo) return '';
  return `/api/events/${id}/gallery/${photo}/image`;
}

/**
 * Browser-facing URL for one gallery photo.
 * Prefer a public R2 HTTPS URL when R2_PUBLIC_BASE is set; otherwise the
 * permanent API path (frontend prefixes the API origin).
 */
export function resolveGalleryDisplayUrl(photo, eventId) {
  const id = String(photo?.id || photo?._id || '');
  if (photo?.r2Key) {
    return r2PublicUrl(photo.r2Key) || galleryApiImagePath(eventId, id);
  }
  return String(photo?.url || '');
}

export function isPrivateR2ObjectUrl(url) {
  const value = String(url || '').toLowerCase();
  return value.includes('.r2.cloudflarestorage.com');
}
