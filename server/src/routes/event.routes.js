import { Router } from 'express';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../controllers/event.controller.js';
import {
  getStreamConfig,
  updateStreamConfig,
  getStreamKey,
  regenerateStreamKey,
  setLiveStatus,
  getChatHistory,
  listQuestions,
} from '../controllers/stream.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router
  .route('/')
  .get(optionalAuth, listEvents)
  .post(protect, createEvent);

// ── Live streaming sub-resources (multi-segment, so no slug conflict) ──
router.get('/:id/stream', getStreamConfig);
router.patch('/:id/stream', protect, updateStreamConfig);
router.get('/:id/stream/key', protect, getStreamKey);
router.post('/:id/stream/key/regenerate', protect, regenerateStreamKey);
router.post('/:id/stream/live', protect, setLiveStatus);
router.get('/:id/chat', getChatHistory);
router.get('/:id/questions', listQuestions);

router
  .route('/:id')
  .patch(protect, updateEvent)
  .delete(protect, deleteEvent);

// Fetch by id OR slug (kept after the param routes above for clarity).
router.get('/:idOrSlug', getEvent);

export default router;
