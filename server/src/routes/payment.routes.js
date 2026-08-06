import { Router } from 'express';
import {
  getProducts,
  createPaymentRequest,
  listMyPayments,
  createRazorpayOrder,
  verifyRazorpayPayment,
  cancelRazorpayPayment,
} from '../controllers/payment.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/products', optionalAuth, getProducts);
router.post('/request', protect, createPaymentRequest);
router.get('/mine', protect, listMyPayments);

router.post('/razorpay/create-order', protect, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);
router.post('/razorpay/cancel', protect, cancelRazorpayPayment);
// Webhook is mounted in app.js with express.raw (signature needs raw body).

export default router;
