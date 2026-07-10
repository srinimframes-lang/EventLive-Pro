export const BANNER_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const BANNER_VIDEO_ACCEPT = 'video/mp4,video/webm';
export const BANNER_MEDIA_ACCEPT = `${BANNER_IMAGE_ACCEPT},${BANNER_VIDEO_ACCEPT}`;

export const BANNER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const BANNER_VIDEO_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);

export function bannerMediaTypeFromFile(file) {
  if (!file) return null;
  if (VIDEO_MIMES.has(file.type)) return 'video';
  if (IMAGE_MIMES.has(file.type)) return 'image';
  return null;
}

export function validateBannerMediaFile(file) {
  if (!file) return 'Please select a banner image or video';

  const mediaType = bannerMediaTypeFromFile(file);
  if (!mediaType) {
    return 'Only JPG, PNG, WebP, MP4, and WebM files are allowed';
  }

  const maxBytes = mediaType === 'video' ? BANNER_VIDEO_MAX_BYTES : BANNER_IMAGE_MAX_BYTES;
  if (file.size > maxBytes) {
    return mediaType === 'video'
      ? 'Video must be 10 MB or smaller'
      : 'Image must be 8 MB or smaller';
  }

  return null;
}

export function isBannerVideo(banner) {
  if (!banner) return false;
  if (banner.mediaType === 'video') return true;
  return /\.(mp4|webm)(\?|$)/i.test(banner.imageUrl || '');
}
