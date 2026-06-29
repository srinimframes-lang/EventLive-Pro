import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  uploadCompanyLogo,
  uploadUpiQr,
} from '../controllers/settings.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.get('/', getSettings);
router.patch('/', protect, authorize('admin'), updateSettings);
router.post('/logo', protect, authorize('admin'), upload.single('logo'), uploadCompanyLogo);
router.post('/qr', protect, authorize('admin'), upload.single('qr'), uploadUpiQr);

export default router;
