import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import {
  BANNER_IMAGE_MIMES,
  BANNER_VIDEO_MIMES,
  BANNER_VIDEO_MAX_BYTES,
} from '../utils/bannerMedia.js';

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const BANNER_MIMES = new Set([...BANNER_IMAGE_MIMES, ...BANNER_VIDEO_MIMES]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function bannerFileFilter(_req, file, cb) {
  if (BANNER_MIMES.has(file.mimetype)) return cb(null, true);
  return cb(new Error('Banner media must be JPG, PNG, WebP, MP4, or WebM'));
}

/** Banner-only uploads: images (8 MB validated in controller) + videos up to 10 MB. */
export const bannerUpload = multer({
  storage,
  fileFilter: bannerFileFilter,
  limits: { fileSize: BANNER_VIDEO_MAX_BYTES },
});
