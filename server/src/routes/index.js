import { Router } from 'express';
import authRoutes from './auth.routes.js';
import eventRoutes from './event.routes.js';
import settingsRoutes from './settings.routes.js';
import packageRoutes from './package.routes.js';
import bookingRoutes from './booking.routes.js';
import adminRoutes from './admin.routes.js';
import resellerRoutes from './reseller.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/settings', settingsRoutes);
router.use('/packages', packageRoutes);
router.use('/bookings', bookingRoutes);
router.use('/admin', adminRoutes);
router.use('/reseller', resellerRoutes);

export default router;
