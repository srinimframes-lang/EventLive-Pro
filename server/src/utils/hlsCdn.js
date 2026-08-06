/**
 * Viewer HLS CDN toggle — affects ONLY browser playback base host.
 * Never touches RTMP ingest, stream keys, MediaMTX, recording, or R2.
 */
import { env } from '../config/env.js';

/** In-memory mirror of Settings.hlsCdnEnabled (synced on boot + settings PATCH). */
let hlsCdnEnabled = Boolean(env.hlsCdnEnabled);

export function isHlsCdnEnabled() {
  return Boolean(hlsCdnEnabled);
}

/** Called from settings bootstrap / update. Env default applies until first sync. */
export function setHlsCdnEnabled(enabled) {
  hlsCdnEnabled = Boolean(enabled);
}

/** Origin HLS base (MediaMTX via stream.eventlivepro.com) — never the CDN host. */
export function getOriginHlsPlaybackBase() {
  return String(env.hlsPlaybackBase || 'https://stream.eventlivepro.com').replace(/\/+$/, '');
}

/** CDN HLS base when toggle is ON. */
export function getCdnHlsPlaybackBase() {
  return String(env.hlsCdnPlaybackBase || 'https://cdn.eventlivepro.com').replace(/\/+$/, '');
}

/**
 * Viewer-facing HLS HTTPS base.
 * OFF → https://stream.eventlivepro.com
 * ON  → https://cdn.eventlivepro.com
 */
export function getViewerHlsPlaybackBase() {
  return isHlsCdnEnabled() ? getCdnHlsPlaybackBase() : getOriginHlsPlaybackBase();
}

/** Rewrite /live/.../(index|master).m3u8 onto the current viewer base (stream or CDN). */
export function rewriteViewerHlsUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const pathMatch = trimmed.match(/(\/live\/[^/]+\/(?:index|master)\.m3u8)$/i);
  if (!pathMatch) return trimmed;
  return `${getViewerHlsPlaybackBase()}${pathMatch[1]}`;
}
