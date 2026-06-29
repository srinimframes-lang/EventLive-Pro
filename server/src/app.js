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

const app = express();

// Security & core middleware. Allow images/assets to be embedded cross-origin
// (the uploaded gallery photos & logos are served from this origin).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: env.clientUrl,
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
