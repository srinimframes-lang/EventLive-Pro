import { Router } from 'express';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  syncEventQr,
} from '../controllers/event.controller.js';
import {
  getStreamConfig,
  updateStreamConfig,
  getStreamKey,
  regenerateStreamKey,
  setLiveStatus,
  setStreamDisabled,
  restartStream,
  authenticateStream,
  mediamtxAuth,
  streamStarted,
  streamStopped,
  getChatHistory,
  listQuestions,
} from '../controllers/stream.controller.js';
import {
  uploadGallery,
  deleteGalleryPhoto,
  uploadLogo,
  uploadCover,
} from '../controllers/media.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router
  .route('/')
  .get(optionalAuth, listEvents)
  .post(protect, createEvent);

// ── Media-server webhooks (secret-protected, no auth middleware) ──────
// Registered before the :id routes; 'stream' is a literal first segment so it
// never collides with the slug/:id param routes below.
router.post('/stream/auth', authenticateStream);
router.post('/stream/mediamtx-auth', mediamtxAuth);
router.post('/stream/started', streamStarted);
router.post('/stream/stopped', streamStopped);

// ── Live streaming sub-resources (multi-segment, so no slug conflict) ──
router.get('/:id/stream', getStreamConfig);
router.patch('/:id/stream', protect, updateStreamConfig);
router.get('/:id/stream/key', protect, getStreamKey);
router.post('/:id/stream/key/regenerate', protect, regenerateStreamKey);
router.post('/:id/stream/live', protect, setLiveStatus);
router.post('/:id/stream/disable', protect, setStreamDisabled);
router.post('/:id/stream/restart', protect, restartStream);
router.get('/:id/chat', getChatHistory);
router.get('/:id/questions', listQuestions);

// ── Media: gallery photos & photography logo ──────────────────────────
router.post('/:id/gallery', protect, upload.array('photos', 20), uploadGallery);
router.delete('/:id/gallery/:photoId', protect, deleteGalleryPhoto);
router.post('/:id/logo', protect, upload.single('logo'), uploadLogo);
router.post('/:id/cover', protect, upload.single('cover'), uploadCover);
router.post('/:id/qr/sync', protect, syncEventQr);

router
  .route('/:id')
  .patch(protect, updateEvent)
  .delete(protect, deleteEvent);

// Fetch by id OR slug (kept after the param routes above for clarity).
router.get('/:idOrSlug', getEvent);

export default router;
