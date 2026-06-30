import { Router } from 'express';
import {
  resolveByHost,
  myDomains,
  addMyDomain,
  verifyMyDomain,
  deleteMyDomain,
  updateMyBranding,
  uploadMyBrandingLogo,
} from '../controllers/tenant.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// Public: resolve an incoming host to a customer's branding.
router.get('/resolve', resolveByHost);

// Authenticated customer self-service.
router.get('/my-domains', protect, myDomains);
router.post('/my-domains', protect, addMyDomain);
router.post('/my-domains/:id/verify', protect, verifyMyDomain);
router.delete('/my-domains/:id', protect, deleteMyDomain);
router.patch('/my-branding', protect, updateMyBranding);
router.post('/my-branding/logo', protect, upload.single('logo'), uploadMyBrandingLogo);

export default router;
