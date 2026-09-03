/**
 * EventLive website background music (Cloudflare Stream live pages only).
 * Catalog ids map to public R2 /uploads paths — never third-party hotlinks,
 * never ingest secrets. Playback is a separate HTMLAudioElement on the client.
 */

import { r2PublicUrl } from './r2.js';

export const DEFAULT_BACKGROUND_MUSIC_VOLUME = 0.35;
export const LIVE_BACKGROUND_MUSIC_EVENT = 'elp:live-background-music';

/** Allowlisted royalty-free/licensed library ids. Files are served from R2 or /uploads. */
export const BACKGROUND_MUSIC_CATALOG = Object.freeze([
  {
    id: 'ambient-soft',
    title: 'Soft ambient',
    objectKey: 'music/library/ambient-soft.mp3',
  },
]);

const CATALOG_BY_ID = new Map(BACKGROUND_MUSIC_CATALOG.map((entry) => [entry.id, entry]));

const PUBLIC_SLICE_KEYS = [
  'backgroundMusicEnabled',
  'backgroundMusicId',
  'backgroundMusicVolume',
  'backgroundMusicUrl',
  'backgroundMusicTitle',
];

function isCloudflareStreamEvent(source = {}) {
  return String(source.liveIngestProvider || '') === 'cloudflare_stream';
}

const SECRET_FIELD_NAMES = [
  'youtubeStreamKey',
  'facebookStreamKey',
  'rtmpStreamKey',
  'cfStreamRtmpsKey',
  'youtubeProvisionError',
];

export function listBackgroundMusicCatalog() {
  return BACKGROUND_MUSIC_CATALOG.map((entry) => ({ ...entry }));
}

export function normalizeBackgroundMusicId(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  if (!id || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) return null;
  return CATALOG_BY_ID.has(id) ? id : null;
}

export function isValidBackgroundMusicId(raw) {
  return Boolean(normalizeBackgroundMusicId(raw));
}

export function getBackgroundMusicEntry(raw) {
  const id = normalizeBackgroundMusicId(raw);
  return id ? CATALOG_BY_ID.get(id) : null;
}

export function clampBackgroundMusicVolume(raw, fallback = DEFAULT_BACKGROUND_MUSIC_VOLUME) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Public HTTPS or same-origin /uploads URL. Never returns private S3/R2 API URLs.
 */
export function resolveBackgroundMusicUrl(raw, { publicBase } = {}) {
  const entry = getBackgroundMusicEntry(raw);
  if (!entry) return '';
  const override = String(publicBase || '').trim().replace(/\/+$/, '');
  if (override) return `${override}/${entry.objectKey}`;
  const fromR2 = r2PublicUrl(entry.objectKey);
  if (fromR2) return fromR2;
  return `/uploads/${entry.objectKey}`;
}

export function shouldActivateLiveBackgroundMusic(source = {}) {
  if (!isCloudflareStreamEvent(source)) return false;
  if (source.backgroundMusicEnabled !== true) return false;
  return isValidBackgroundMusicId(source.backgroundMusicId);
}

/** Theme page music must not play alongside live BGM on Cloudflare watch pages. */
export function shouldSuppressThemeMusic(source = {}) {
  return shouldActivateLiveBackgroundMusic(source);
}

/**
 * Apply BGM fields only for Cloudflare Stream events.
 * MediaMTX / YouTube-only docs are left unchanged even if the client sends fields.
 *
 * @returns {string|null} error message or null
 */
export function applyBackgroundMusicFields(target, body = {}, { isCloudflare = false } = {}) {
  if (!target || !isCloudflare) return null;

  if (body.backgroundMusicEnabled !== undefined) {
    target.backgroundMusicEnabled = Boolean(body.backgroundMusicEnabled);
  }
  if (body.backgroundMusicId !== undefined) {
    const raw = body.backgroundMusicId;
    if (raw == null || String(raw).trim() === '') {
      target.backgroundMusicId = null;
    } else {
      const id = normalizeBackgroundMusicId(raw);
      if (!id) return 'Select a valid background music track.';
      target.backgroundMusicId = id;
    }
  }
  if (body.backgroundMusicVolume !== undefined) {
    target.backgroundMusicVolume = clampBackgroundMusicVolume(
      body.backgroundMusicVolume,
      target.backgroundMusicVolume ?? DEFAULT_BACKGROUND_MUSIC_VOLUME
    );
  }

  if (target.backgroundMusicEnabled) {
    const id = normalizeBackgroundMusicId(target.backgroundMusicId);
    if (!id) return 'Select a valid background music track.';
    target.backgroundMusicId = id;
    if (target.backgroundMusicVolume == null) {
      target.backgroundMusicVolume = DEFAULT_BACKGROUND_MUSIC_VOLUME;
    } else {
      target.backgroundMusicVolume = clampBackgroundMusicVolume(target.backgroundMusicVolume);
    }
  }

  return null;
}

/**
 * Public stream-config slice. Null for non-Cloudflare events (historical payload).
 * Never includes ingest keys or OAuth tokens.
 */
export function publicBackgroundMusicSlice(event = {}) {
  if (!isCloudflareStreamEvent(event)) {
    return null;
  }

  const id = normalizeBackgroundMusicId(event.backgroundMusicId);
  const enabled = event.backgroundMusicEnabled === true && Boolean(id);
  const volume = clampBackgroundMusicVolume(
    event.backgroundMusicVolume,
    DEFAULT_BACKGROUND_MUSIC_VOLUME
  );
  const entry = enabled ? getBackgroundMusicEntry(id) : null;

  const slice = {
    backgroundMusicEnabled: enabled,
    backgroundMusicId: enabled ? id : null,
    backgroundMusicVolume: volume,
    backgroundMusicUrl: enabled ? resolveBackgroundMusicUrl(id) : '',
    backgroundMusicTitle: entry?.title || '',
  };

  for (const secret of SECRET_FIELD_NAMES) {
    delete slice[secret];
  }
  return slice;
}

export function backgroundMusicPublicKeys() {
  return [...PUBLIC_SLICE_KEYS];
}
