import { Router } from 'express';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../controllers/event.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router
  .route('/')
  .get(optionalAuth, listEvents)
  .post(protect, createEvent);

router
  .route('/:id')
  .patch(protect, updateEvent)
  .delete(protect, deleteEvent);

// Fetch by id OR slug (kept after the param routes above for clarity).
router.get('/:idOrSlug', getEvent);

export default router;
