/**
 * Verify reception themes seed and layout variants resolve.
 * Run: node scripts/test-reception-themes.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

const mongod = await MongoMemoryServer.create({ instance: { dbName: 'eventlive' } });
process.env.MONGODB_URI = mongod.getUri('eventlive');

await mongoose.connect(process.env.MONGODB_URI);

const { Theme, THEME_LAYOUT_VARIANTS } = await import('../src/models/Theme.js');
const { seedCuratedThemes } = await import('../src/config/seedCuratedThemes.js');

await seedCuratedThemes();

const reception = await Theme.find({ category: 'reception' }).sort({ sortOrder: 1 });
const wedding = await Theme.find({ category: 'wedding' });

if (reception.length !== 2) {
  throw new Error(`Expected 2 reception themes, got ${reception.length}`);
}
if (wedding.length !== 10) {
  throw new Error(`Expected 10 wedding themes unchanged, got ${wedding.length}`);
}

const slugs = ['premium-reception-royal-night', 'premium-reception-crystal'];
const layouts = ['reception-royal-night', 'reception-crystal'];

for (let i = 0; i < slugs.length; i += 1) {
  const t = reception.find((r) => r.slug === slugs[i]);
  if (!t) throw new Error(`Missing theme ${slugs[i]}`);
  if (t.layoutVariant !== layouts[i]) {
    throw new Error(`${t.slug} layoutVariant ${t.layoutVariant} !== ${layouts[i]}`);
  }
  if (!THEME_LAYOUT_VARIANTS.includes(t.layoutVariant)) {
    throw new Error(`Layout ${t.layoutVariant} not in server enum`);
  }
}

console.log('OK reception themes', reception.map((t) => `${t.name} (${t.layoutVariant})`).join(', '));
console.log('OK wedding themes count', wedding.length);

await mongoose.disconnect();
await mongod.stop();
