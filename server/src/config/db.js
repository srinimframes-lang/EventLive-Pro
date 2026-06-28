import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Establishes the MongoDB connection via Mongoose.
 * Exits the process on initial connection failure so the
 * orchestrator (nodemon / container) can restart cleanly.
 */
export async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(env.mongoUri);
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
