import { Router } from 'express';
import {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getAnalytics,
} from '../controllers/admin.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All admin routes require an authenticated super admin.
router.use(protect, authorize('admin'));

router.get('/analytics', getAnalytics);
router.route('/customers').get(listCustomers).post(createCustomer);
router.route('/customers/:id').patch(updateCustomer).delete(deleteCustomer);

export default router;
