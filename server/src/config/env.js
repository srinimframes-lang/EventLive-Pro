import dotenv from 'dotenv';

dotenv.config();

/** MediaMTX VPS host for Premium Server Live RTMP ingest (OBS). */
export const MEDIAMTX_VPS_HOST = '200.97.166.42';

/** Public HTTPS domain that reverse-proxies MediaMTX HLS for browser playback. */
export const STREAM_PUBLIC_DOMAIN =
  process.env.STREAM_PUBLIC_DOMAIN || 'stream.eventlivepro.com';

function trimUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** Rewrite legacy localhost / loopback RTMP ingest env values to the public stream host. */
export function normalizeRtmpIngestUrl(url) {
  const domain = STREAM_PUBLIC_DOMAIN;
  const fallback = `rtmp://${domain}:1935/live`;
  const trimmed = trimUrl(url);
  if (!trimmed) return fallback;
  return trimmed
    .replace(/^rtmp:\/\/localhost(?::\d+)?/i, `rtmp://${domain}:1935`)
    .replace(/^rtmp:\/\/127\.0\.0\.1(?::\d+)?/i, `rtmp://${domain}:1935`);
}

function defaultHlsPlaybackBase() {
  if (process.env.HLS_PLAYBACK_BASE) return trimUrl(process.env.HLS_PLAYBACK_BASE);
  return `https://${STREAM_PUBLIC_DOMAIN}`;
}

function defaultWebrtcPlaybackBase() {
  if (process.env.WEBRTC_PLAYBACK_BASE) return trimUrl(process.env.WEBRTC_PLAYBACK_BASE);
  return `https://${STREAM_PUBLIC_DOMAIN}`;
}

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
const configuredClientUrls = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Production custom-domain origins are always allowed, so the live site keeps
// working even if CLIENT_URL on the host is not updated. Dev config is untouched.
const PRODUCTION_ORIGINS = [
  'https://eventlivepro.com',
  'https://www.eventlivepro.com',
];

const clientUrls = [...new Set([...configuredClientUrls, ...PRODUCTION_ORIGINS])];

const isProd = process.env.NODE_ENV === 'production';

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
  mediamtxVpsHost: MEDIAMTX_VPS_HOST,
  streamPublicDomain: STREAM_PUBLIC_DOMAIN,
  // RTMP ingest for OBS (public stream hostname; not loaded in browsers).
  rtmpIngestUrl: normalizeRtmpIngestUrl(
    process.env.RTMP_INGEST_URL || `rtmp://${STREAM_PUBLIC_DOMAIN}:1935/live`
  ),
  // Browser HLS playback — HTTPS on the public stream domain (mixed-content safe).
  hlsPlaybackBase: defaultHlsPlaybackBase(),
  webrtcPlaybackBase: defaultWebrtcPlaybackBase(),
  // Server-side MediaMTX API probe (internal HTTP is fine).
  mediamtxApiUrl: trimUrl(process.env.MEDIAMTX_API_URL || `http://${MEDIAMTX_VPS_HOST}:9997`),
  requireSecurePlayback:
    isProd || process.env.REQUIRE_SECURE_PLAYBACK === 'true',
  // Shared secret the media server presents to the stream webhooks.
  mediaServerSecret: process.env.MEDIA_SERVER_SECRET || '',
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
  // Optional Vercel integration for white-label custom domains. When a token +
  // project id are set, approving a domain attaches it to the Vercel project
  // (auto SSL) and reads its verification/SSL status. Without these, the app
  // still verifies DNS ownership and the domain is attached manually in Vercel.
  vercel: {
    token: process.env.VERCEL_TOKEN || '',
    projectId: process.env.VERCEL_PROJECT_ID || '',
    teamId: process.env.VERCEL_TEAM_ID || '',
    get enabled() {
      return Boolean(this.token && this.projectId);
    },
  },
  isProd,
};
