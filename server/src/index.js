import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { initSocket } from './realtime/socket.js';
import { runSeed } from './config/seed.js';
import { startFailoverHealthWorker } from './services/failoverHealthWorker.js';
import { syncHlsCdnFromSettings } from './controllers/settings.controller.js';

async function start() {
  await connectDB();

  // Ensure baseline data (super admin, settings, packages) exists.
  try {
    await runSeed();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] Seed failed:', err.message);
  }

  // Viewer HLS CDN toggle from Settings (default OFF — origin stream host).
  try {
    await syncHlsCdnFromSettings();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] HLS CDN sync failed:', err.message);
  }

  const server = http.createServer(app);

  // Attach Socket.IO and expose it to controllers via app.get('io').
  const io = initSocket(server);
  app.set('io', io);

  // Dormant unless FAILOVER_ENABLED=true — does not alter livestream when off.
  startFailoverHealthWorker({ getIo: () => app.get('io') });

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] EventLive Pro API running on http://localhost:${env.port} (${env.nodeEnv})`);
    // eslint-disable-next-line no-console
    console.log('[server] Socket.IO real-time gateway ready');
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[server] Unhandled rejection:', reason);
    server.close(() => process.exit(1));
  });
}

start();
