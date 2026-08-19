import { Router } from 'express';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  syncEventQr,
  getYoutubeIngest,
} from '../controllers/event.controller.js';
import {
  getStreamConfig,
  updateStreamConfig,
  getStreamKey,
  regenerateStreamKey,
  setLiveStatus,
  setStreamDisabled,
  restartStream,
  getStreamHealth,
  emergencyStreamControl,
  authenticateStream,
  mediamtxAuth,
  youtubeForwardConfig,
  facebookForwardConfig,
  streamForwardsConfig,
  abrStreamConfig,
  streamStarted,
  streamStopped,
  recordingReady,
  playRecording,
  getRecordingPlayUrl,
  downloadRecording,
  getRecordingMeta,
  hideRecording,
  restoreRecording,
  deleteRecordingPermanently,
  getChatHistory,
  listQuestions,
} from '../controllers/stream.controller.js';
import {
  uploadGallery,
  deleteGalleryPhoto,
  deleteGalleryPhotos,
  reorderGallery,
  setGalleryCover,
  playGalleryImage,
  uploadLogo,
  uploadCover,
  uploadShareThumbnail,
  uploadTemplateImage,
} from '../controllers/media.controller.js';
import { extractWeddingCard, confirmWeddingCard } from '../controllers/weddingCard.controller.js';
import { protect, optionalAuth, authorize, authorizePlatformAdmin } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { weddingCardUpload } from '../middleware/weddingCardUpload.middleware.js';

const router = Router();

router
  .route('/')
  .get(optionalAuth, listEvents)
  .post(protect, createEvent);

router.post(
  '/wedding-card/extract',
  protect,
  weddingCardUpload.single('card'),
  extractWeddingCard
);
router.post(
  '/wedding-card/confirm',
  protect,
  weddingCardUpload.single('card'),
  confirmWeddingCard
);

// ── Media-server webhooks (secret-protected, no auth middleware) ──────
// Registered before the :id routes; 'stream' is a literal first segment so it
// never collides with the slug/:id param routes below.
router.post('/stream/auth', authenticateStream);
router.post('/stream/mediamtx-auth', mediamtxAuth);
router.get('/stream/youtube-forward', youtubeForwardConfig);
router.post('/stream/youtube-forward', youtubeForwardConfig);
router.get('/stream/facebook-forward', facebookForwardConfig);
router.post('/stream/facebook-forward', facebookForwardConfig);
router.get('/stream/forwards', streamForwardsConfig);
router.post('/stream/forwards', streamForwardsConfig);
router.get('/stream/abr-config', abrStreamConfig);
router.post('/stream/abr-config', abrStreamConfig);
router.post('/stream/started', streamStarted);
router.post('/stream/stopped', streamStopped);
router.post('/stream/recording-ready', recordingReady);

// ── Live streaming sub-resources (multi-segment, so no slug conflict) ──
router.get('/:id/stream', getStreamConfig);
router.patch('/:id/stream', protect, updateStreamConfig);
router.get('/:id/stream/key', protect, getStreamKey);
router.get('/:id/youtube-ingest', protect, getYoutubeIngest);
router.post('/:id/stream/key/regenerate', protect, regenerateStreamKey);
router.post('/:id/stream/live', protect, setLiveStatus);
router.post('/:id/stream/disable', protect, setStreamDisabled);
router.post('/:id/stream/restart', protect, restartStream);
router.get('/:id/stream/health', getStreamHealth);
router.post(
  '/:id/stream/emergency',
  protect,
  authorize('admin', 'superadmin'),
  authorizePlatformAdmin,
  emergencyStreamControl
);
router.get('/:id/stream/recording/url', optionalAuth, getRecordingPlayUrl);
router.get('/:id/stream/recording', optionalAuth, playRecording);
router.get('/:id/stream/recording/download', protect, downloadRecording);
router.get('/:id/stream/recording/meta', protect, getRecordingMeta);
router.post('/:id/stream/recording/hide', protect, hideRecording);
router.post('/:id/stream/recording/restore', protect, restoreRecording);
router.delete('/:id/stream/recording', protect, deleteRecordingPermanently);
router.get('/:id/chat', getChatHistory);
router.get('/:id/questions', listQuestions);

// ── Media: gallery photos & photography logo ──────────────────────────
router.post('/:id/gallery', protect, upload.array('photos', 20), uploadGallery);
router.post('/:id/gallery/delete', protect, deleteGalleryPhotos);
router.patch('/:id/gallery/reorder', protect, reorderGallery);
router.post('/:id/gallery/:photoId/cover', protect, setGalleryCover);
router.get('/:id/gallery/:photoId/image', playGalleryImage);
router.delete('/:id/gallery/:photoId', protect, deleteGalleryPhoto);
router.post('/:id/logo', protect, upload.single('logo'), uploadLogo);
router.post('/:id/cover', protect, upload.single('cover'), uploadCover);
router.post('/:id/share-thumbnail', protect, upload.single('thumbnail'), uploadShareThumbnail);
router.post('/:id/media/:kind', protect, upload.single('image'), uploadTemplateImage);
router.post('/:id/qr/sync', protect, syncEventQr);

router
  .route('/:id')
  .patch(protect, updateEvent)
  .delete(protect, deleteEvent);

// Fetch by id OR slug (kept after the param routes above for clarity).
router.get('/:idOrSlug', getEvent);

export default router;
