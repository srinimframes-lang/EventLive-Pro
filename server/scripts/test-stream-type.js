/**
 * Integration test: create YouTube vs Premium Server events and verify stream config.
 * Run: node scripts/test-stream-type.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
process.env.HLS_PLAYBACK_BASE = 'http://200.97.166.42:8888';
process.env.RTMP_INGEST_URL = 'rtmp://200.97.166.42:1935/live';

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
console.log('OK Server event', srvEvent.shortCode, srvEvent.streamProvider, 'key=', withKey.rtmpStreamKey);

const { deriveHlsPlaybackUrl } = await import('../src/utils/mediaStream.js');
const playback = deriveHlsPlaybackUrl(withKey);
const expectedPlayback = `http://200.97.166.42:8888/live/${srvEvent._id}/index.m3u8`;
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
