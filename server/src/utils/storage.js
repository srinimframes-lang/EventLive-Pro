import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { UPLOADS_DIR } from '../middleware/upload.middleware.js';
import { mediaTypeFromMime, isVideoUrl } from './bannerMedia.js';
import { deleteR2Object, isR2Configured, uploadFileToR2 } from './r2.js';

function safeUploadBasename(value) {
  const raw = String(value || '')
    .trim()
    .split('?')[0]
    .replace(/\\/g, '/');
  if (!raw || raw.includes('..')) return '';
  const name = path.posix.basename(raw);
  if (!name || name === 'uploads' || name.startsWith('.')) return '';
  return name;
}

/** R2 object key for a public `/uploads/<file>` path stored in MongoDB. */
export function uploadsR2KeyFromUrl(url) {
  const raw = String(url || '').trim().split('?')[0];
  if (!raw.startsWith('/uploads/')) return '';
  const name = safeUploadBasename(raw);
  return name ? `uploads/${name}` : '';
}

/** R2 object key from an Express-mounted `/uploads` request path (`/file.jpg`). */
export function uploadsR2KeyFromPath(reqPath) {
  const name = safeUploadBasename(reqPath);
  return name ? `uploads/${name}` : '';
}

async function persistLocalToR2(file, contentType) {
  if (!isR2Configured() || !file?.filename || !file?.path) return false;
  const key = `uploads/${file.filename}`;
  await uploadFileToR2(file.path, key, contentType || file.mimetype || 'application/octet-stream');
  return true;
}

// Lazily-configured Cloudinary client (only loaded when credentials exist).
let cloudinaryClient = null;
let cloudinaryReady = false;

async function getCloudinary() {
  if (!env.cloudinary.enabled) return null;
  if (cloudinaryReady) return cloudinaryClient;

  const mod = await import('cloudinary');
  const cloudinary = mod.v2;
  if (env.cloudinary.url) {
    // CLOUDINARY_URL is parsed automatically from the environment by the SDK.
    cloudinary.config({ secure: true });
  } else {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
  }
  cloudinaryClient = cloudinary;
  cloudinaryReady = true;
  return cloudinaryClient;
}

function unlinkLocal(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}

/**
 * Persists an uploaded file and returns its public URL.
 * - Cloudinary (when configured): uploads the file and returns the secure URL.
 * - Cloudflare R2 (when Cloudinary is off): stores the bytes durably and still
 *   returns `/uploads/<file>` so existing clients keep working.
 * - Local disk: same `/uploads/<file>` path, served by express.static with an
 *   R2 fallback after Render restarts.
 *
 * @param {Express.Multer.File} file
 * @returns {Promise<string>} public URL
 */
export async function persistUpload(file) {
  const localUrl = `/uploads/${file.filename}`;
  const cloudinary = await getCloudinary();
  if (cloudinary) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'eventlive',
        resource_type: 'image',
        timeout: 60_000,
      });
      // The local temp copy is no longer needed once it lives in Cloudinary.
      unlinkLocal(file.path);
      return result.secure_url;
    } catch (err) {
      // If the cloud upload fails, fall back to R2 / local disk so the
      // request still succeeds rather than 500-ing.
      // eslint-disable-next-line no-console
      console.error('[storage] Cloudinary upload failed, using R2/local disk:', err.message);
    }
  }
  try {
    await persistLocalToR2(file, file.mimetype || 'image/jpeg');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storage] R2 upload failed, using local disk:', err.message);
  }
  return localUrl;
}

/**
 * Persist a banner image or video upload.
 * @param {Express.Multer.File} file
 * @returns {Promise<{ url: string, mediaType: 'image'|'video' }>}
 */
export async function persistBannerUpload(file) {
  const mediaType = mediaTypeFromMime(file.mimetype) || 'image';
  const cloudinary = await getCloudinary();
  if (cloudinary) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'eventlive/banners',
        resource_type: mediaType === 'video' ? 'video' : 'image',
        timeout: 120_000,
      });
      unlinkLocal(file.path);
      return { url: result.secure_url, mediaType };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[storage] Cloudinary banner upload failed, using R2/local disk:', err.message);
    }
  }
  try {
    await persistLocalToR2(file, file.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storage] R2 banner upload failed, using local disk:', err.message);
  }
  return { url: `/uploads/${file.filename}`, mediaType };
}

/**
 * Remove a banner media file (image or video).
 * @param {string} url
 * @param {'image'|'video'} [mediaType]
 */
export async function removeBannerUpload(url, mediaType = 'image') {
  if (!url) return;

  const isVideo = mediaType === 'video' || isVideoUrl(url);

  if (url.includes('res.cloudinary.com')) {
    const cloudinary = await getCloudinary();
    if (!cloudinary) return;
    const match = url.match(/\/(?:image|video)\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    if (match) {
      cloudinary.uploader
        .destroy(match[1], { resource_type: isVideo ? 'video' : 'image' })
        .catch(() => {});
    }
    return;
  }

  if (url.startsWith('/uploads/')) {
    unlinkLocal(path.join(UPLOADS_DIR, path.basename(url)));
    const key = uploadsR2KeyFromUrl(url);
    if (key) deleteR2Object(key).catch(() => {});
  }
}

/**
 * Best-effort removal of a previously-persisted upload.
 * @param {string} url
 */
export async function removeUpload(url) {
  if (!url) return;

  if (url.includes('res.cloudinary.com')) {
    const cloudinary = await getCloudinary();
    if (!cloudinary) return;
    // Derive the public_id (including folder) from the URL, dropping the
    // version segment and file extension: …/upload/v123/eventlive/abc.jpg
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    if (match) {
      cloudinary.uploader.destroy(match[1], { resource_type: 'image' }).catch(() => {});
    }
    return;
  }

  if (url.startsWith('/uploads/')) {
    unlinkLocal(path.join(UPLOADS_DIR, path.basename(url)));
    const key = uploadsR2KeyFromUrl(url);
    if (key) deleteR2Object(key).catch(() => {});
  }
}
