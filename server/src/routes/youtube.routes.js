import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {
  startYoutubeOauth,
  youtubeOauthCallback,
  youtubeOauthStatus,
  disconnectYoutubeOauth,
} from '../controllers/youtubeOauth.controller.js';

const router = Router();

router.get('/oauth/start', protect, startYoutubeOauth);
router.get('/oauth/callback', youtubeOauthCallback);
router.get('/oauth/status', protect, youtubeOauthStatus);
router.post('/oauth/disconnect', protect, disconnectYoutubeOauth);

export default router;
