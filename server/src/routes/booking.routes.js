import { Router } from 'express';
import {
  createBooking,
  listMyBookings,
  listAllBookings,
  getBooking,
  approveBooking,
  rejectBooking,
} from '../controllers/booking.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// Customer
router.post('/', protect, createBooking);
router.get('/mine', protect, listMyBookings);

// Admin
router.get('/', protect, authorize('admin'), listAllBookings);
router.post('/:id/approve', protect, authorize('admin'), approveBooking);
router.post('/:id/reject', protect, authorize('admin'), rejectBooking);

// Shared (owner or admin) — keep last so it doesn't shadow /mine
router.get('/:id', protect, getBooking);

export default router;
