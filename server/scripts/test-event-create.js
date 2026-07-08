/**
 * Integration test: event create with empty optional studio/social fields.
 * Run: node scripts/test-event-create.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

const mongod = await MongoMemoryServer.create({ instance: { dbName: 'eventlive' } });
process.env.MONGODB_URI = mongod.getUri('eventlive');

await mongoose.connect(process.env.MONGODB_URI);

const { User } = await import('../src/models/User.js');
const { Event } = await import('../src/models/Event.js');
const { Theme } = await import('../src/models/Theme.js');
const { seedCuratedThemes } = await import('../src/config/seedCuratedThemes.js');
const { normalizeStudioFields } = await import('../src/utils/studioFields.js');

await seedCuratedThemes();
const theme = await Theme.findOne({ isActive: true });
const admin = await User.create({
  name: 'Test Admin',
  email: 'admin@test.com',
  password: 'password123',
  role: 'admin',
});

const payload = normalizeStudioFields({
  title: 'Minimal Test Wedding',
  description: 'A simple test event with only required fields.',
  category: 'other',
  status: 'draft',
  startTime: new Date('2026-12-01T10:00:00.000Z'),
  endTime: new Date('2026-12-01T18:00:00.000Z'),
  isOnline: true,
  organizer: admin._id,
  studioInstagram: '',
  studioFacebook: '',
  studioYoutube: '',
  studioEmail: '',
  studioWebsite: '',
  studioMapsUrl: '',
  studioWhatsapp: '',
  tags: [],
  theme: theme._id,
  themeSnapshot: theme.toSnapshot(),
});

const event = await Event.create(payload);
console.log('OK', event.title, event.shortCode, event.slug);

await mongoose.disconnect();
await mongod.stop();
