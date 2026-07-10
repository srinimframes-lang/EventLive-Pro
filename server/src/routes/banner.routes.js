import { Router } from 'express';
import {
  listActiveBanners,
  trackBannerView,
  trackBannerClick,
} from '../controllers/banner.controller.js';

const router = Router();

router.get('/', listActiveBanners);
router.post('/:id/view', trackBannerView);
router.post('/:id/click', trackBannerClick);

export default router;
