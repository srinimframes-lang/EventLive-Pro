import { Router } from 'express';
import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
} from '../controllers/package.controller.js';
import { protect, optionalAuth, authorize } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', optionalAuth, listPackages);
router.post('/', protect, authorize('admin'), createPackage);
router.patch('/:id', protect, authorize('admin'), updatePackage);
router.delete('/:id', protect, authorize('admin'), deletePackage);

export default router;
