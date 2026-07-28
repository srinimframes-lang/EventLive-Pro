// Centralised backend origin resolution.
//
// Priority:
//   1. VITE_API_URL (set at build time on Vercel) — normalised to a bare origin.
//   2. Known production Render API (never the MediaMTX stream host).
//   3. Empty string only for local Vite proxy ("same origin").
//
const PROD_API_ORIGIN = 'https://eventlive-pro.onrender.com';

function normaliseOrigin(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

function isStreamHost(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host.startsWith('stream.');
  } catch {
    return /stream\.eventlivepro\.com/i.test(origin);
  }
}

const RAW_API_URL = normaliseOrigin(import.meta.env.VITE_API_URL);

let origin = RAW_API_URL;

// Guard: never use the HLS/MediaMTX host as the REST API base.
if (origin && isStreamHost(origin)) {
  origin = PROD_API_ORIGIN;
}

if (!origin && typeof window !== 'undefined') {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  if (!isLocal) origin = PROD_API_ORIGIN;
}

export const API_ORIGIN = origin;
export const MEDIA_ORIGIN = origin;

/** Exact admin/customer login endpoint used by authService. */
export const AUTH_LOGIN_URL = `${API_ORIGIN || ''}/api/auth/login`;
