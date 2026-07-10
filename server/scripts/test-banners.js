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
  mediaType: 'image',
  clickUrl: 'https://example.com',
  locations: ['homepage', 'footer'],
  enabled: true,
  priority: 10,
  startDate: yesterday,
  endDate: tomorrow,
});

await Banner.create({
  companyName: 'Video Ad Co',
  imageUrl: '/uploads/test-banner.mp4',
  mediaType: 'video',
  sizePreset: '728x90',
  fitMode: 'contain',
  locations: ['homepage'],
  enabled: true,
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

if (homepage.length !== 2) {
  throw new Error(`Expected 2 active homepage banners, got ${homepage.length}`);
}

const videoBanner = homepage.find((b) => b.mediaType === 'video');
if (!videoBanner || videoBanner.companyName !== 'Video Ad Co') {
  throw new Error('Video banner not returned in active list');
}

const { normalizeSizePreset, normalizeFitMode } = await import('../src/utils/bannerSizes.js');
if (normalizeSizePreset('970x250') !== '970x250') throw new Error('size preset failed');
if (normalizeSizePreset(undefined, '100') !== '320x100') throw new Error('legacy mobileSize map failed');
if (normalizeFitMode('cover') !== 'cover') throw new Error('fit mode failed');
if (videoBanner.sizePreset !== '728x90') throw new Error('video banner sizePreset missing');

const { assertBannerFile, mediaTypeFromMime } = await import('../src/utils/bannerMedia.js');
if (mediaTypeFromMime('video/mp4') !== 'video') throw new Error('video/mp4 type check failed');
if (mediaTypeFromMime('image/png') !== 'image') throw new Error('image/png type check failed');
try {
  assertBannerFile({ mimetype: 'image/gif', size: 1000 });
  throw new Error('gif should be rejected');
} catch (err) {
  if (!/JPG|WebP|MP4/i.test(err.message)) throw err;
}

const viewed = await Banner.findByIdAndUpdate(active._id, { $inc: { views: 1 } }, { new: true });
const clicked = await Banner.findByIdAndUpdate(active._id, { $inc: { clicks: 1 } }, { new: true });

if (viewed.views !== 1 || clicked.clicks !== 1) {
  throw new Error('View/click tracking failed');
}

console.log('OK banner system', {
  image: homepage.find((b) => b.mediaType === 'image')?.companyName,
  video: videoBanner.companyName,
  views: clicked.views,
  clicks: clicked.clicks,
});

await mongoose.disconnect();
await mongod.stop();
