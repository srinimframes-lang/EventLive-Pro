/**
 * Integration test: banner CRUD, active filtering, view/click tracking.
 * Run: node scripts/test-banners.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

const mongod = await MongoMemoryServer.create({ instance: { dbName: 'eventlive' } });
process.env.MONGODB_URI = mongod.getUri('eventlive');

await mongoose.connect(process.env.MONGODB_URI);

const { Banner } = await import('../src/models/Banner.js');

const now = new Date();
const yesterday = new Date(now.getTime() - 86_400_000);
const tomorrow = new Date(now.getTime() + 86_400_000);
const lastWeek = new Date(now.getTime() - 7 * 86_400_000);

const active = await Banner.create({
  companyName: 'Active Co',
  imageUrl: '/uploads/test-banner.jpg',
  clickUrl: 'https://example.com',
  locations: ['homepage', 'footer'],
  enabled: true,
  priority: 10,
  startDate: yesterday,
  endDate: tomorrow,
});

await Banner.create({
  companyName: 'Expired Co',
  imageUrl: '/uploads/expired.jpg',
  locations: ['homepage'],
  enabled: true,
  endDate: lastWeek,
});

await Banner.create({
  companyName: 'Disabled Co',
  imageUrl: '/uploads/disabled.jpg',
  locations: ['homepage'],
  enabled: false,
});

const homepage = await Banner.find({
  enabled: true,
  locations: 'homepage',
  $and: [
    { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
    { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
  ],
}).sort({ priority: -1 });

if (homepage.length !== 1 || homepage[0].companyName !== 'Active Co') {
  throw new Error(`Expected 1 active homepage banner, got ${homepage.length}`);
}

const viewed = await Banner.findByIdAndUpdate(active._id, { $inc: { views: 1 } }, { new: true });
const clicked = await Banner.findByIdAndUpdate(active._id, { $inc: { clicks: 1 } }, { new: true });

if (viewed.views !== 1 || clicked.clicks !== 1) {
  throw new Error('View/click tracking failed');
}

console.log('OK banner system', {
  active: homepage[0].companyName,
  views: clicked.views,
  clicks: clicked.clicks,
});

await mongoose.disconnect();
await mongod.stop();
