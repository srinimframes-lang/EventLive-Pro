/**
 * Zero-setup local development launcher.
 *
 * Spins up an in-memory MongoDB (via mongodb-memory-server), points the app at
 * it through MONGODB_URI, and then boots the normal server entrypoint. This lets
 * you run the full backend without installing MongoDB locally.
 *
 *   npm run dev:memdb   (from the repo root or the server workspace)
 *
 * For production / a real database, use `npm start` with a real MONGODB_URI.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create({
  instance: { dbName: 'eventlive' },
});

// Set BEFORE importing the app so dotenv (which never overrides existing
// process.env values) leaves our in-memory URI in place.
process.env.MONGODB_URI = mongod.getUri('eventlive');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_in_memory_secret_change_me';

// eslint-disable-next-line no-console
console.log(`[dev:memdb] In-memory MongoDB started at ${process.env.MONGODB_URI}`);

await import('../src/index.js');

const shutdown = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
