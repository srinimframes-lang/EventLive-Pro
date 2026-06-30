import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { UPLOADS_DIR } from './middleware/upload.middleware.js';
import { startDomainCache, isActiveDomainOrigin } from './utils/domainCache.js';

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy. Trust the first
// proxy hop so req.ip / rate-limiting / secure cookies behave correctly.
app.set('trust proxy', 1);

// Security & core middleware. Allow images/assets to be embedded cross-origin
// (the uploaded gallery photos & logos are served from this origin).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS allow-list: accept any configured client origin (normalised, no trailing
// slash) plus requests with no Origin header (curl, health checks, same-origin).
// Approved white-label custom domains are allowed dynamically via a cached
// allow-list (refreshed from the Domain collection).
const allowedOrigins = new Set(env.clientUrls);
// Keep the cache of active custom-domain origins warm.
startDomainCache();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalised = origin.replace(/\/+$/, '');
      if (allowedOrigins.has(normalised)) return callback(null, true);
      if (isActiveDomainOrigin(normalised)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded media (gallery photos, photography logos).
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    fallthrough: true,
  })
);

if (!env.isProd) {
  app.use(morgan('dev'));
}

// Rate limit the auth-heavy API surface
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// API routes
app.use('/api', apiRoutes);

// 404 + error handling
app.use(notFound);
app.use(errorHandler);

export default app;
