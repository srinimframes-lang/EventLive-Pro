import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { UPLOADS_DIR } from '../middleware/upload.middleware.js';

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
 *   Survives Render redeploys/restarts.
 * - Local disk (fallback): returns a relative `/uploads/<file>` path served by
 *   express.static. The client resolves it against the backend origin.
 *
 * @param {Express.Multer.File} file
 * @returns {Promise<string>} public URL
 */
export async function persistUpload(file) {
  const cloudinary = await getCloudinary();
  if (cloudinary) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'eventlive',
        resource_type: 'image',
      });
      // The local temp copy is no longer needed once it lives in Cloudinary.
      unlinkLocal(file.path);
      return result.secure_url;
    } catch (err) {
      // If the cloud upload fails, fall back to serving from local disk so the
      // request still succeeds rather than 500-ing.
      // eslint-disable-next-line no-console
      console.error('[storage] Cloudinary upload failed, using local disk:', err.message);
    }
  }
  return `/uploads/${file.filename}`;
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
  }
}
