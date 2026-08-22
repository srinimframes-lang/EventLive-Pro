import crypto from 'crypto';
import { extractYouTubeId } from './youtube.js';
import {
  applyYoutubeLiveFields,
  isYoutubeQuotaExceeded,
  provisionYoutubeLiveIfNeeded,
  youtubeLog,
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
  // Status polling must never call YouTube APIs. Manual retry is confirm only.
  return false;
}

export function weddingCardLiveStatus(event, { ingest = null, error = null } = {}) {
  if (eventHasYoutubeBroadcast(event) || ingest) {
    return {
      status: 'ready',
      message: 'YouTube Live created successfully',
      reason: '',
    };
  }
  const errMessage = String(error?.message || event?.youtubeProvisionError || '').trim();
  if (error || String(event.youtubeProvisionStatus || '') === 'failed') {
    return {
      status: 'failed',
      message: 'YouTube Live creation failed',
      reason: errMessage || 'YouTube Live creation failed',
    };
  }
  return {
    status: 'provisioning',
    message: 'Wedding details saved. YouTube Live link is being generated.',
    reason: '',
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
    event.youtubeProvisionError = '';
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
      youtubeLog('Saving YouTube data to event');
      applyYoutubeLiveFields(event, ingest);
      applyStreamTypeSelection(event, 'youtube');
      event.creditType = 'none';
      event.youtubeProvisionStatus = 'ready';
      event.youtubeProvisionError = '';
      event.status = 'published';
      youtubeLog('Creation completed');
    } else if (!eventHasYoutubeBroadcast(event)) {
      event.youtubeProvisionStatus = 'failed';
      const err = new Error(
        'YouTube Live was not created. Confirm YouTube is connected and live streaming is enabled on that channel.'
      );
      err.statusCode = 502;
      event.youtubeProvisionError = err.message;
      return { ingest: null, error: err };
    }
    return { ingest: ingest || null, error: null };
  } catch (error) {
    event.youtubeProvisionStatus = 'failed';
    event.youtubeProvisionError = String(error?.message || 'YouTube Live creation failed').slice(0, 500);
    youtubeLog('Creation failed', {
      message: event.youtubeProvisionError,
      quotaExceeded: isYoutubeQuotaExceeded(error),
    });
    return { ingest: null, error };
  } finally {
    if (lockId) provisionLocks.delete(lockId);
  }
}
