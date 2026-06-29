import { Payment } from '../models/Payment.js';
import { Settings } from '../models/Settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  CREDIT_PRODUCTS,
  CREDIT_UNIT_PRICE,
  LINK_COSTS,
  getProductById,
} from '../config/credits.js';

/**
 * @route GET /api/payments/products
 * @desc  Product catalogue, pricing, UPI payment details, and (if authed) balance
 * @access Public (optional auth)
 */
export const getProducts = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  const p = settings.payment || {};
  res.status(200).json({
    success: true,
    data: {
      products: CREDIT_PRODUCTS,
      unitPrice: CREDIT_UNIT_PRICE,
      linkCosts: LINK_COSTS,
      creditBalance: req.user?.creditBalance ?? null,
      upi: {
        upiId: p.upiId || '',
        upiName: p.upiName || '',
        upiQr: p.upiQr || '',
      },
    },
  });
});

/**
 * @route POST /api/payments/request
 * @desc  Submit a manual UPI credit-purchase request (status: pending)
 * @access Private
 */
export const createPaymentRequest = asyncHandler(async (req, res) => {
  const product = getProductById(req.body.productId);
  if (!product) {
    res.status(400);
    throw new Error('Please choose a valid credit product');
  }

  // Prevent stacking many open requests.
  const openCount = await Payment.countDocuments({ user: req.user._id, status: 'pending' });
  if (openCount >= 5) {
    res.status(429);
    throw new Error('You already have several pending requests. Please wait for them to be reviewed.');
  }

  const payment = await Payment.create({
    user: req.user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'upi_qr',
    reference: String(req.body.reference || '').trim().slice(0, 80),
    status: 'pending',
  });

  res.status(201).json({ success: true, data: payment });
});

/**
 * @route GET /api/payments/mine
 * @desc  The customer's own payment requests
 * @access Private
 */
export const listMyPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.status(200).json({ success: true, data: payments });
});
