import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

// Resolve (and lazily create) the uploads directory at the server root.
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  return cb(new Error('Only image files (jpeg, png, webp, gif, svg) are allowed'));
}

// Shared multer instance (max 8 MB per image).
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

/**
 * Public URL path for an uploaded file (served by express.static at /uploads).
 */
export function uploadedFileUrl(file) {
  return `/uploads/${file.filename}`;
}
