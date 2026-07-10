/** Banner ad media types and validation (server). */
export const BANNER_MEDIA_TYPES = ['image', 'video'];

export const BANNER_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const BANNER_VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);

export const BANNER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const BANNER_VIDEO_MAX_BYTES = 10 * 1024 * 1024;

export function mediaTypeFromMime(mime) {
  if (BANNER_VIDEO_MIMES.has(mime)) return 'video';
  if (BANNER_IMAGE_MIMES.has(mime)) return 'image';
  return null;
}

export function assertBannerFile(file) {
  if (!file) {
    const err = new Error('Banner media file is required');
    err.statusCode = 400;
    throw err;
  }

  const mediaType = mediaTypeFromMime(file.mimetype);
  if (!mediaType) {
    const err = new Error('Banner media must be JPG, PNG, WebP, MP4, or WebM');
    err.statusCode = 400;
    throw err;
  }

  const maxBytes = mediaType === 'video' ? BANNER_VIDEO_MAX_BYTES : BANNER_IMAGE_MAX_BYTES;
  if (file.size > maxBytes) {
    const limitMb = mediaType === 'video' ? 10 : 8;
    const err = new Error(`${mediaType === 'video' ? 'Video' : 'Image'} must be ${limitMb} MB or smaller`);
    err.statusCode = 400;
    throw err;
  }

  return mediaType;
}

export function isVideoUrl(url) {
  return /\.(mp4|webm)(\?|$)/i.test(url || '');
}
