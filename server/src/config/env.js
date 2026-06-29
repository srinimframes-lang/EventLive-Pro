import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised, validated environment configuration.
 * Throws early (at boot) if a required variable is missing.
 */
const required = ['MONGODB_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `\n[config] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy server/.env.example to server/.env and fill in the values.\n'
  );
  process.exit(1);
}

// Accept one or more comma-separated client origins (production URL, custom
// domain, local dev, etc.) and normalise away trailing slashes so the CORS
// allow-list matches the browser's Origin header exactly.
const clientUrls = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrl: clientUrls[0],
  clientUrls,
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieExpiresDays: Number(process.env.JWT_COOKIE_EXPIRES_DAYS) || 7,
  },
  // Base RTMP ingest URL that broadcasters point OBS at. The per-event stream
  // key is appended to this (e.g. rtmp://localhost:1935/live/<streamKey>).
  rtmpIngestUrl: process.env.RTMP_INGEST_URL || 'rtmp://localhost:1935/live',
  // Super Admin bootstrap. On first boot the server ensures this account exists
  // (role=admin). Set these on Render; change the password after first login.
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'MaaEvents9 Admin',
    email: (process.env.SUPER_ADMIN_EMAIL || 'admin@maaevents9.com').toLowerCase().trim(),
    password: process.env.SUPER_ADMIN_PASSWORD || 'MaaEvents9@Admin',
  },
  // Optional Cloudinary credentials for durable image storage. When present,
  // uploads go to Cloudinary (surviving redeploys); otherwise local disk is
  // used as a fallback. Set CLOUDINARY_URL or the three discrete vars on Render.
  cloudinary: {
    url: process.env.CLOUDINARY_URL || '',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    get enabled() {
      return Boolean(this.url || (this.cloudName && this.apiKey && this.apiSecret));
    },
  },
  isProd: process.env.NODE_ENV === 'production',
};
