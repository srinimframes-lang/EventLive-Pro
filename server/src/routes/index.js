import { Router } from 'express';
import authRoutes from './auth.routes.js';
import eventRoutes from './event.routes.js';

const router = Router();

// Mount feature routers here as the API grows (streams, tickets, etc.)
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);

export default router;
