/**
 * Safe YouTube live diagnostics for one event (no tokens/secrets logged).
 * Usage: node scripts/diagnose-youtube-live.js [eventId|shortCode|slug]
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Event } from '../src/models/Event.js';
import { loadUserCredential } from '../src/utils/youtubeOauth.js';
import {
  eventYoutubeLookupId,
  youtubeOauthUserIds,
  getBroadcastPlaybackInfo,
  listActiveBroadcastPlayback,
  selectLiveYoutubePlayback,
} from '../src/services/youtubeLiveApi.js';
import { extractYouTubeId } from '../src/utils/youtube.js';

const raw = process.argv[2] || 'SMP4XY';

function safePlayback(info) {
  if (!info) return null;
  return {
    videoId: info.videoId || '',
    broadcastId: info.broadcastId || '',
    title: info.title || '',
    lifeCycleStatus: info.lifeCycleStatus || '',
    isLive: info.isLive === true,
    watchUrl: info.watchUrl || '',
  };
}

async function findEvent(idOrCode) {
  const rawArg = String(idOrCode || '').trim();
  if (/^[a-f0-9]{24}$/i.test(rawArg)) {
    return Event.findById(rawArg);
  }
  const upper = rawArg.toUpperCase();
  const lower = rawArg.toLowerCase();
  return Event.findOne({
    $or: [{ shortCode: upper }, { slug: lower }, { slug: rawArg }],
  });
}

await mongoose.connect(env.mongoUri);
const event = await findEvent(raw);
if (!event) {
  console.error('Event not found:', raw);
  process.exit(1);
}

const storedId = eventYoutubeLookupId(event);
const ownerIds = youtubeOauthUserIds(event);

console.log('=== Event ===');
console.log({
  eventId: String(event._id),
  slug: event.slug,
  shortCode: event.shortCode,
  title: event.title,
  status: event.status,
  youtubeBroadcastId: event.youtubeBroadcastId || '',
  youtubeVideoId: event.youtubeVideoId || '',
  streamUrl: event.streamUrl || '',
  youtubeWatchUrl: event.youtubeWatchUrl || '',
  storedLookupId: storedId,
  oauthUserIds: ownerIds,
});

for (const ownerId of ownerIds) {
  const cred = await loadUserCredential(ownerId);
  console.log('\n=== OAuth account ===');
  console.log({
    userId: ownerId,
    connected: Boolean(cred?.connected),
    channelId: cred?.channelId || '',
    channelTitle: cred?.channelTitle || '',
  });
  if (!cred?.connected) continue;

  let storedInfo = null;
  if (storedId) {
    try {
      storedInfo = await getBroadcastPlaybackInfo(ownerId, storedId);
    } catch (err) {
      console.log('stored broadcast lookup error:', err?.message || err);
    }
  }
  console.log('stored broadcast from YouTube API:', safePlayback(storedInfo));

  let activeInfos = [];
  try {
    activeInfos = await listActiveBroadcastPlayback(ownerId);
  } catch (err) {
    console.log('active broadcast list error:', err?.message || err);
  }
  console.log(
    'active broadcasts from YouTube API:',
    activeInfos.map(safePlayback)
  );

  const picked = selectLiveYoutubePlayback(storedInfo, activeInfos, {
    eventBroadcastId: extractYouTubeId(event.youtubeBroadcastId) || storedId,
    eventTitle: event.title,
    allowActiveFallback: event.status !== 'ended' && event.status !== 'cancelled',
  });
  console.log('selectLiveYoutubePlayback result:', safePlayback(picked));
}

await mongoose.disconnect();
