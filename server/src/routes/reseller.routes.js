import { Router } from 'express';
import {
  getResellerMe,
  listMyTransactions,
  createCreditOrder,
  listMyCreditOrders,
  listMyEvents,
} from '../controllers/reseller.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// All reseller routes require an authenticated sub admin.
router.use(protect, authorize('subadmin'));

router.get('/me', getResellerMe);
router.get('/transactions', listMyTransactions);
router.get('/events', listMyEvents);
router
  .route('/credit-orders')
  .get(listMyCreditOrders)
  .post(upload.single('screenshot'), createCreditOrder);

export default router;
