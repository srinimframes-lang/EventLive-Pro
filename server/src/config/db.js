import mongoose from 'mongoose';
import { env } from './env.js';

/** EventLive production data lives in the `eventlive` database. */
export function resolveMongoUri(uri) {
  const trimmed = String(uri || '').trim();
  if (!trimmed) return trimmed;
  try {
    const normalized = trimmed
      .replace(/^mongodb\+srv:/, 'https:')
      .replace(/^mongodb:/, 'http:');
    const u = new URL(normalized);
    const dbName = (u.pathname || '').replace(/^\//, '').split('/')[0];
    if (dbName) return trimmed;
  } catch {
    return trimmed;
  }
  const qIndex = trimmed.indexOf('?');
  if (qIndex >= 0) {
    const base = trimmed.slice(0, qIndex).replace(/\/+$/, '');
    return `${base}/eventlive${trimmed.slice(qIndex)}`;
  }
  return `${trimmed.replace(/\/+$/, '')}/eventlive`;
}

/**
 * Establishes the MongoDB connection via Mongoose.
 * Exits the process on initial connection failure so the
 * orchestrator (nodemon / container) can restart cleanly.
 */
export async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(resolveMongoUri(env.mongoUri));
    // eslint-disable-next-line no-console
    console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[db] MongoDB connection error:', error.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[db] MongoDB disconnected');
  });
}
