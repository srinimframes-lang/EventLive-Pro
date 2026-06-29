import { Router } from 'express';
import {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  adjustCustomerCredits,
  getAnalytics,
  createSubAdmin,
  listSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
  adjustSubAdminCredits,
  listCreditOrders,
  approveCreditOrder,
  rejectCreditOrder,
} from '../controllers/admin.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All admin routes require an authenticated super admin.
router.use(protect, authorize('admin'));

router.get('/analytics', getAnalytics);

router.route('/customers').get(listCustomers).post(createCustomer);
router.route('/customers/:id').patch(updateCustomer).delete(deleteCustomer);
router.post('/customers/:id/credits', adjustCustomerCredits);

// Resellers (sub admins)
router.route('/subadmins').get(listSubAdmins).post(createSubAdmin);
router.route('/subadmins/:id').patch(updateSubAdmin).delete(deleteSubAdmin);
router.post('/subadmins/:id/credits', adjustSubAdminCredits);

// Credit top-up orders
router.get('/credit-orders', listCreditOrders);
router.post('/credit-orders/:id/approve', approveCreditOrder);
router.post('/credit-orders/:id/reject', rejectCreditOrder);

export default router;
