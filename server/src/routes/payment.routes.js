import { Router } from 'express';
import {
  getProducts,
  createPaymentRequest,
  listMyPayments,
} from '../controllers/payment.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/products', optionalAuth, getProducts);
router.post('/request', protect, createPaymentRequest);
router.get('/mine', protect, listMyPayments);

export default router;
