import { Router } from 'express';
import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
} from '../controllers/package.controller.js';
import { protect, optionalAuth, authorize, authorizePlatformAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', optionalAuth, listPackages);
router.post('/', protect, authorize('admin', 'superadmin'), authorizePlatformAdmin, createPackage);
router.patch('/:id', protect, authorize('admin', 'superadmin'), authorizePlatformAdmin, updatePackage);
router.delete('/:id', protect, authorize('admin', 'superadmin'), authorizePlatformAdmin, deletePackage);

export default router;
