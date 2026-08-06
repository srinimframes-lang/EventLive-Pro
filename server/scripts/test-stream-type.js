/**
 * Integration test: create YouTube vs Premium Server events and verify stream config.
 * Run: node scripts/test-stream-type.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
process.env.REQUIRE_SECURE_PLAYBACK = 'true';
process.env.HLS_PLAYBACK_BASE = 'https://stream.eventlivepro.com';
process.env.RTMP_INGEST_URL = 'rtmp://stream.eventlivepro.com:1935/live';

const mongod = await MongoMemoryServer.create({ instance: { dbName: 'eventlive' } });
process.env.MONGODB_URI = mongod.getUri('eventlive');

await mongoose.connect(process.env.MONGODB_URI);

const { User } = await import('../src/models/User.js');
const { Event } = await import('../src/models/Event.js');
const { Theme } = await import('../src/models/Theme.js');
const { seedCuratedThemes } = await import('../src/config/seedCuratedThemes.js');
const { applyStreamTypeSelection, normalizeStreamType } = await import('../src/utils/streamType.js');

await seedCuratedThemes();
const theme = await Theme.findOne({ isActive: true });
const admin = await User.create({
  name: 'Stream Test Admin',
  email: 'admin-stream@test.com',
  password: 'password123',
  role: 'admin',
});

const base = {
  description: 'Stream type test event.',
  category: 'other',
  status: 'draft',
  startTime: new Date('2026-12-01T10:00:00.000Z'),
  endTime: new Date('2026-12-01T18:00:00.000Z'),
  isOnline: true,
  organizer: admin._id,
  theme: theme._id,
  themeSnapshot: theme.toSnapshot(),
  creditType: 'none',
};

// YouTube event
const ytPayload = {
  ...base,
  title: 'YouTube Stream Test',
  youtubeVideoId: 'dQw4w9WgXcQ',
  streamUrl: 'https://youtu.be/dQw4w9WgXcQ',
};
applyStreamTypeSelection(ytPayload, normalizeStreamType({ streamType: 'youtube' }), { isCreate: true });
const ytEvent = await Event.create(ytPayload);
if (ytEvent.streamProvider !== 'youtube') throw new Error('YouTube event should have streamProvider youtube');
if (!ytEvent.youtubeVideoId) throw new Error('YouTube event missing youtubeVideoId');
console.log('OK YouTube event', ytEvent.shortCode, ytEvent.streamProvider);

// Premium Server event
const srvPayload = { ...base, title: 'Server Stream Test' };
applyStreamTypeSelection(srvPayload, normalizeStreamType({ streamType: 'server' }), { isCreate: true });
const srvEvent = await Event.create(srvPayload);
if (srvEvent.streamProvider !== 'rtmp') throw new Error('Server event should have streamProvider rtmp');
if (!srvEvent.rtmpStreamKey) throw new Error('Server event missing rtmpStreamKey');
const withKey = await Event.findById(srvEvent._id).select('+rtmpStreamKey');
if (!withKey.rtmpStreamKey) throw new Error('Server rtmpStreamKey not persisted');
if (withKey.rtmpStreamKey !== srvEvent._id.toString()) {
  throw new Error(`Stream key should equal event id, got ${withKey.rtmpStreamKey}`);
}
if (!withKey.rtmpPublishUrl?.includes(withKey.rtmpStreamKey)) {
  throw new Error(`Missing stored RTMP URL: ${withKey.rtmpPublishUrl}`);
}
if (!withKey.hlsUrl?.includes(withKey.rtmpStreamKey)) {
  throw new Error(`Missing stored playback URL: ${withKey.hlsUrl}`);
}
console.log('OK Server event', srvEvent.shortCode, 'rtmp=', withKey.rtmpPublishUrl);

// Server + YouTube simultaneous
const { applyYoutubeForwardFields } = await import('../src/utils/youtubeForward.js');
const bothPayload = { ...base, title: 'Server+YouTube Stream Test' };
applyStreamTypeSelection(bothPayload, normalizeStreamType({ streamType: 'server_youtube' }), {
  isCreate: true,
});
const fwdErr = applyYoutubeForwardFields(
  bothPayload,
  {
    streamingDestination: 'server_youtube',
    youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeStreamKey: 'xxxx-yyyy-zzzz-aaaa',
    youtubeForwardEnabled: true,
  },
  { isCreate: true }
);
if (fwdErr) throw new Error(fwdErr);
const bothEvent = await Event.create(bothPayload);
if (bothEvent.streamProvider !== 'rtmp') throw new Error('Simultaneous should use rtmp provider');
if (bothEvent.streamingDestination !== 'server_youtube') {
  throw new Error('Simultaneous destination mismatch');
}
if (!bothEvent.youtubeForwardEnabled) throw new Error('Forward should be enabled');
const bothKeyed = await Event.findById(bothEvent._id).select('+youtubeStreamKey');
if (bothKeyed.youtubeStreamKey !== 'xxxx-yyyy-zzzz-aaaa') {
  throw new Error('YouTube stream key not stored');
}
const bothJson = bothEvent.toJSON();
if (bothJson.youtubeStreamKey) throw new Error('YouTube stream key leaked in toJSON');
console.log('OK Server+YouTube event', bothEvent.shortCode);

// YouTube + Server: MediaMTX ingest + forward, website uses YouTube embed id
const ytSrvPayload = {
  ...base,
  title: 'YouTube+Server Stream Test',
  youtubeVideoId: 'dQw4w9WgXcQ',
  streamUrl: 'https://youtu.be/dQw4w9WgXcQ',
};
applyStreamTypeSelection(ytSrvPayload, normalizeStreamType({ streamType: 'youtube_server' }), {
  isCreate: true,
});
const ytSrvFwdErr = applyYoutubeForwardFields(
  ytSrvPayload,
  {
    streamingDestination: 'youtube_server',
    youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeStreamKey: 'yyyy-zzzz-aaaa-bbbb',
    youtubeForwardEnabled: true,
  },
  { isCreate: true }
);
if (ytSrvFwdErr) throw new Error(ytSrvFwdErr);
const ytSrvEvent = await Event.create(ytSrvPayload);
if (ytSrvEvent.streamProvider !== 'rtmp') throw new Error('YouTube+Server must use rtmp provider');
if (ytSrvEvent.streamingDestination !== 'youtube_server') {
  throw new Error('YouTube+Server destination mismatch');
}
if (!ytSrvEvent.youtubeVideoId) throw new Error('YouTube+Server missing embed video id');
if (!ytSrvEvent.youtubeForwardEnabled) throw new Error('YouTube+Server forward should be on');
console.log('OK YouTube+Server event', ytSrvEvent.shortCode, ytSrvEvent.youtubeVideoId);

const { deriveHlsPlaybackUrl } = await import('../src/utils/mediaStream.js');
const playback = deriveHlsPlaybackUrl(withKey);
const expectedPlayback = `https://stream.eventlivepro.com/live/${srvEvent._id}/index.m3u8`;
if (playback !== expectedPlayback) throw new Error(`Unexpected playback URL: ${playback}`);
console.log('OK Server playback URL', playback);

// Server provider must win over stale YouTube fields
const provider = srvEvent.streamProvider === 'rtmp' ? 'rtmp' : 'youtube';
if (provider !== 'rtmp') throw new Error('Server public provider should be rtmp');
console.log('OK Server public provider', provider);

// Legacy YouTube event (only youtubeVideoId, no explicit streamType)
const legacy = await Event.create({
  ...base,
  title: 'Legacy YouTube Event',
  youtubeVideoId: 'abc123xyz',
  streamUrl: 'https://youtu.be/abc123xyz',
});
if (legacy.streamProvider !== 'youtube') {
  // pre-save hook should set provider
  const reloaded = await Event.findById(legacy._id);
  if (reloaded.streamProvider !== 'youtube') {
    throw new Error('Legacy YouTube event should auto-set streamProvider youtube');
  }
}
console.log('OK Legacy YouTube event preserved', legacy.shortCode);

console.log('All stream type tests passed.');

await mongoose.disconnect();
await mongod.stop();
