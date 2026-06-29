// Centralised backend origin resolution.
//
// Priority:
//   1. VITE_API_URL (set at build time) — normalised to a bare origin.
//   2. In the browser on a non-localhost host, fall back to the known
//      production API so the deployed app works even if the env var is missing.
//   3. Otherwise empty string ("same origin") so the Vite dev proxy handles it.
const PROD_API_FALLBACK = 'https://eventlive-pro.onrender.com';

const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();
let origin = RAW_API_URL.replace(/\/+$/, '').replace(/\/api$/i, '');

if (!origin && typeof window !== 'undefined') {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  if (!isLocal) origin = PROD_API_FALLBACK;
}

export const API_ORIGIN = origin;
export const MEDIA_ORIGIN = origin;
