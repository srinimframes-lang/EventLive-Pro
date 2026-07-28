import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  uploadCompanyLogo,
  uploadUpiQr,
} from '../controllers/settings.controller.js';
import { protect, authorize, authorizePlatformAdmin } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.get('/', getSettings);
router.patch('/', protect, authorize('admin', 'superadmin'), authorizePlatformAdmin, updateSettings);
router.post(
  '/logo',
  protect,
  authorize('admin', 'superadmin'),
  authorizePlatformAdmin,
  upload.single('logo'),
  uploadCompanyLogo
);
router.post(
  '/qr',
  protect,
  authorize('admin', 'superadmin'),
  authorizePlatformAdmin,
  upload.single('qr'),
  uploadUpiQr
);

export default router;
