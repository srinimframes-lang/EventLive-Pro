/**
 * Integration: customers can create EventLivePro live links without payment.
 * Run: node scripts/test-customer-live-link.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

const mongod = await MongoMemoryServer.create({ instance: { dbName: 'eventlive' } });
process.env.MONGODB_URI = mongod.getUri('eventlive');
await mongoose.connect(process.env.MONGODB_URI);

const { User } = await import('../src/models/User.js');
const { Event } = await import('../src/models/Event.js');
const { createEvent, updateEvent, deleteEvent, listEvents } = await import('../src/controllers/event.controller.js');
const { canManageEvent } = await import('../src/utils/ownership.js');
const { watchPath } = await import('../src/utils/seo.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set() {
      return this;
    },
  };
}

async function invoke(handler, req) {
  const res = mockRes();
  await new Promise((resolve, reject) => {
    Promise.resolve(handler(req, res, reject)).then(resolve).catch(reject);
  });
  if (res.statusCode >= 400) {
    const err = new Error(res.body?.message || `HTTP ${res.statusCode}`);
    err.status = res.statusCode;
    err.body = res.body;
    throw err;
  }
  return res;
}

const admin = await User.create({
  name: 'Live Admin',
  email: 'live-admin@test.com',
  password: 'password123',
  role: 'superadmin',
  approved: true,
  creditBalance: 0,
});

const customerA = await User.create({
  name: 'Customer A',
  email: 'cust-a@test.com',
  password: 'password123',
  role: 'customer',
  approved: false,
  creditBalance: 0,
  createdBy: admin._id,
});

const customerB = await User.create({
  name: 'Customer B',
  email: 'cust-b@test.com',
  password: 'password123',
  role: 'customer',
  approved: true,
  creditBalance: 0,
  createdBy: admin._id,
});

const createBody = {
  title: 'Ravi Priya Wedding',
  groomName: 'Ravi',
  brideName: 'Priya',
  category: 'wedding',
  startTime: '2026-12-01T10:00:00.000Z',
  youtubeVideoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  streamUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  streamType: 'youtube',
  isOnline: true,
};

const createdRes = await invoke(createEvent, { user: customerA, body: createBody });
assert.equal(createdRes.statusCode, 201);
const created = createdRes.body.data;
assert.equal(created.slug, 'ravi-priya-wedding');
assert.equal(created.publicUrlStyle, 'live');
assert.equal(created.youtubeVideoId, 'dQw4w9WgXcQ');
assert.equal(created.status, 'published');
assert.equal(created.creditType, 'none');
assert.equal(watchPath(created), '/live/ravi-priya-wedding');
const orgId = created.organizer?._id || created.organizer?.id || created.organizer;
assert.equal(String(orgId), String(customerA._id));

const stillA = await User.findById(customerA._id);
assert.equal(stillA.creditBalance, 0, 'creating a YouTube live link must not consume credits');

const collisionRes = await invoke(createEvent, {
  user: customerA,
  body: { ...createBody, title: 'Ravi Priya Wedding 2' },
});
assert.equal(collisionRes.body.data.slug, 'ravi-priya-wedding-2');

const editRes = await invoke(updateEvent, {
  user: customerA,
  params: { id: created.id },
  body: { title: 'Ravi Weds Priya Reception', groomName: 'Ravi Kumar' },
});
assert.equal(editRes.body.data.slug, 'ravi-priya-wedding', 'slug must stay stable after edits');
assert.equal(editRes.body.data.publicUrlStyle, 'live');
assert.equal(watchPath(editRes.body.data), '/live/ravi-priya-wedding');

const liveUrlFormats = [
  'https://www.youtube.com/live/882LagGGVM4',
  'https://youtu.be/882LagGGVM4',
  'https://www.youtube.com/watch?v=882LagGGVM4',
  '882LagGGVM4',
];
for (const [i, liveUrl] of liveUrlFormats.entries()) {
  const liveRes = await invoke(createEvent, {
    user: customerA,
    body: {
      title: `Manual Live ${i + 1}`,
      groomName: 'Srinivas',
      brideName: 'Mounika',
      category: 'wedding',
      startTime: '2026-12-01T10:00:00.000Z',
      youtubeLiveUrl: liveUrl,
      streamUrl: liveUrl,
      youtubeWatchUrl: liveUrl,
      youtubeVideoId: liveUrl,
      streamType: 'youtube',
      isOnline: true,
    },
  });
  assert.equal(liveRes.statusCode, 201);
  assert.equal(liveRes.body.data.youtubeVideoId, '882LagGGVM4', liveUrl);
  const watchId = liveRes.body.data.youtubeWatchUrl || liveRes.body.data.streamUrl || '';
  assert.match(watchId, /882LagGGVM4/);

  const emptyUpdate = await invoke(updateEvent, {
    user: customerA,
    params: { id: liveRes.body.data.id },
    body: {
      title: `Manual Live ${i + 1} edit`,
      youtubeVideoId: '',
      streamType: 'youtube',
      isOnline: true,
    },
  });
  assert.equal(emptyUpdate.body.data.youtubeVideoId, '882LagGGVM4', `preserve after empty update: ${liveUrl}`);
}

let forbidden = false;
try {
  await invoke(updateEvent, {
    user: customerB,
    params: { id: created.id },
    body: { title: 'Hacked' },
  });
} catch (err) {
  forbidden = err.status === 403 || /permission/i.test(err.message);
}
assert.equal(forbidden, true, 'customer B must not edit customer A event');

const fresh = await Event.findById(created.id);
assert.equal(canManageEvent(fresh, customerA), true);
assert.equal(canManageEvent(fresh, customerB), false);
assert.equal(canManageEvent(fresh, admin), true);

let deleteForbidden = false;
try {
  await invoke(deleteEvent, {
    user: customerB,
    params: { id: created.id },
  });
} catch (err) {
  deleteForbidden = err.status === 403 || /permission/i.test(err.message);
}
assert.equal(deleteForbidden, true, 'customer B must not delete customer A event');

const listA = await invoke(listEvents, { user: customerA, query: { mine: 'true', limit: 50 }, headers: {} });
const idsA = (listA.body.data || []).map((e) => String(e.id));
assert.equal(idsA.includes(String(created.id)), true);

const listB = await invoke(listEvents, { user: customerB, query: { mine: 'true', limit: 50 }, headers: {} });
const idsB = (listB.body.data || []).map((e) => String(e.id));
assert.equal(idsB.includes(String(created.id)), false, 'customer B must not see customer A links in mine=true');

console.log('OK customer live link', created.slug, watchPath(created));
console.log('OK unique slug', collisionRes.body.data.slug);
console.log('OK stable URL after edit');
console.log('OK customer isolation');
console.log('OK no credits deducted', stillA.creditBalance);

await mongoose.disconnect();
await mongod.stop();
