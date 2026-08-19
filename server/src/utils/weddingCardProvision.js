import crypto from 'crypto';
import { extractYouTubeId } from './youtube.js';
import {
  applyYoutubeLiveFields,
  provisionYoutubeLiveIfNeeded,
} from '../services/youtubeLiveApi.js';
import { applyStreamTypeSelection } from './streamType.js';

const provisionLocks = new Set();

export function weddingCardFingerprint({ organizerId, groomName, brideName, weddingDate }) {
  const key = [
    String(organizerId || ''),
    String(groomName || '').trim().toLowerCase(),
    String(brideName || '').trim().toLowerCase(),
    String(weddingDate || '').trim(),
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
}

export function weddingCardDuplicateFilter(organizerId, fingerprint) {
  return {
    organizer: organizerId,
    source: 'wedding-card',
    weddingCardFingerprint: fingerprint,
  };
}

export function eventHasYoutubeBroadcast(event) {
  if (!event) return false;
  return Boolean(
    extractYouTubeId(event.youtubeVideoId) ||
      extractYouTubeId(event.youtubeWatchUrl) ||
      extractYouTubeId(event.streamUrl) ||
      extractYouTubeId(event.youtubeBroadcastId)
  );
}

export function shouldRetryYoutubeProvision(event) {
  if (!event) return false;
  if (eventHasYoutubeBroadcast(event)) return false;
  const status = String(event.youtubeProvisionStatus || '');
  return status === 'pending' || status === 'failed' || status === '';
}

export function weddingCardLiveStatus(event, { ingest = null, error = null } = {}) {
  if (eventHasYoutubeBroadcast(event) || ingest) {
    return {
      status: 'ready',
      message: 'Live link ready',
    };
  }
  if (error) {
    return {
      status: 'provisioning',
      message: 'Wedding details saved. YouTube Live link is being generated.',
    };
  }
  return {
    status: 'provisioning',
    message: 'Wedding details saved. YouTube Live link is being generated.',
  };
}

/**
 * Reuses existing provisionYoutubeLiveIfNeeded. Never creates a second
 * broadcast when the event already has a YouTube video/broadcast id.
 */
export async function runWeddingCardYoutubeProvision(
  user,
  event,
  { provisionFn = provisionYoutubeLiveIfNeeded } = {}
) {
  if (!event) return { ingest: null, error: null };
  if (eventHasYoutubeBroadcast(event)) {
    event.youtubeProvisionStatus = 'ready';
    return { ingest: null, error: null };
  }

  const lockId = String(event._id || event.id || '');
  if (lockId && provisionLocks.has(lockId)) {
    return { ingest: null, error: null };
  }
  if (lockId) provisionLocks.add(lockId);

  try {
    const ingest = await provisionFn(user, event, 'youtube', {
      existingVideoId: event.youtubeVideoId || event.youtubeBroadcastId || '',
    });
    if (ingest) {
      applyYoutubeLiveFields(event, ingest);
      applyStreamTypeSelection(event, 'youtube');
      event.creditType = 'none';
      event.youtubeProvisionStatus = 'ready';
      event.status = 'published';
    } else if (!eventHasYoutubeBroadcast(event)) {
      event.youtubeProvisionStatus = event.youtubeProvisionStatus || 'pending';
    }
    return { ingest: ingest || null, error: null };
  } catch (error) {
    event.youtubeProvisionStatus = 'failed';
    return { ingest: null, error };
  } finally {
    if (lockId) provisionLocks.delete(lockId);
  }
}
