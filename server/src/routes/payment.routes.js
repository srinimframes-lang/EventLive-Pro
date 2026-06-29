import { Router } from 'express';
import {
  getProducts,
  createPayment,
  getPaymentStatus,
  phonepeCallback,
  listMyPayments,
} from '../controllers/payment.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/products', optionalAuth, getProducts);
router.post('/create', protect, createPayment);
router.get('/mine', protect, listMyPayments);
router.get('/status/:mtid', protect, getPaymentStatus);

// Server-to-server callback from PhonePe (verified via checksum, no auth).
router.post('/phonepe/callback', phonepeCallback);

export default router;
