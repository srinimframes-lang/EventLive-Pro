import { Router } from 'express';
import authRoutes from './auth.routes.js';

const router = Router();

// Mount feature routers here as the API grows (events, streams, etc.)
router.use('/auth', authRoutes);

export default router;
