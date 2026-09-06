/**
 * Website live background music helpers (Cloudflare Stream watch pages).
 * Catalog ids must match server/src/utils/backgroundMusic.js.
 */

export const DEFAULT_BACKGROUND_MUSIC_VOLUME = 0.35;
export const LIVE_BACKGROUND_MUSIC_EVENT = 'elp:live-background-music';

export const BACKGROUND_MUSIC_CATALOG = Object.freeze([
  {
    id: 'ambient-soft',
    title: 'Soft ambient',
    objectKey: 'music/library/ambient-soft.mp3',
  },
]);

const CATALOG_IDS = new Set(BACKGROUND_MUSIC_CATALOG.map((entry) => entry.id));

export function listBackgroundMusicCatalog() {
  return BACKGROUND_MUSIC_CATALOG.map((entry) => ({ ...entry }));
}

export function normalizeBackgroundMusicId(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  if (!id || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) return null;
  return CATALOG_IDS.has(id) ? id : null;
}

export function isValidBackgroundMusicId(raw) {
  return Boolean(normalizeBackgroundMusicId(raw));
}

export function clampBackgroundMusicVolume(raw, fallback = DEFAULT_BACKGROUND_MUSIC_VOLUME) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function shouldActivateLiveBackgroundMusic(config = {}) {
  if (String(config.liveIngestProvider || '') !== 'cloudflare_stream') return false;
  if (config.backgroundMusicEnabled !== true) return false;
  if (!isValidBackgroundMusicId(config.backgroundMusicId)) return false;
  return Boolean(String(config.backgroundMusicUrl || '').trim());
}

export function shouldSuppressThemeMusic(config = {}) {
  return shouldActivateLiveBackgroundMusic(config);
}

export function notifyLiveBackgroundMusicPlaying(playing) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(
      new CustomEvent(LIVE_BACKGROUND_MUSIC_EVENT, { detail: { playing: Boolean(playing) } })
    );
  } catch {
    /* ignore */
  }
}

export function publicSliceHasNoSecrets(slice = {}) {
  const secretKeys = [
    'youtubeStreamKey',
    'facebookStreamKey',
    'rtmpStreamKey',
    'cfStreamRtmpsKey',
    'accessToken',
    'refreshToken',
  ];
  return secretKeys.every((key) => slice[key] == null);
}
