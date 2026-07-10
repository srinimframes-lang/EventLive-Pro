/**
 * Integration test: multiple consecutive event creates with MongoDB verification.
 * Run: node scripts/test-multiple-event-create.js
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
const { loadVerifiedEvent } = await import('../src/utils/eventSave.js');

await seedCuratedThemes();
const theme = await Theme.findOne({ isActive: true });
const admin = await User.create({
  name: 'Test Admin',
  email: 'admin-multi@test.com',
  password: 'password123',
  role: 'admin',
});

const base = {
  description: 'Consecutive create test event.',
  category: 'other',
  status: 'draft',
  startTime: new Date('2026-12-01T10:00:00.000Z'),
  endTime: new Date('2026-12-01T18:00:00.000Z'),
  isOnline: true,
  organizer: admin._id,
  theme: theme._id,
  themeSnapshot: theme.toSnapshot(),
};

const COUNT = 5;
const created = [];

for (let i = 0; i < COUNT; i += 1) {
  const payload = normalizeStudioFields({
    ...base,
    title: `Consecutive Test ${i + 1}`,
  });
  const event = await Event.create(payload);
  const verified = await loadVerifiedEvent(event._id);
  if (!verified || verified.title !== payload.title) {
    throw new Error(`Verification failed for event ${i + 1}`);
  }
  created.push(verified.shortCode);
  console.log(`OK ${i + 1}/${COUNT}`, verified.shortCode, verified.slug);
}

console.log(`All ${COUNT} events created and verified:`, created.join(', '));

await mongoose.disconnect();
await mongod.stop();
