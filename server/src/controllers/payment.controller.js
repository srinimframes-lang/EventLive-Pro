import crypto from 'crypto';
import { env } from '../config/env.js';
import { Payment } from '../models/Payment.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changeBalance } from '../utils/credits.js';
import {
  CREDIT_PRODUCTS,
  CREDIT_UNIT_PRICE,
  LINK_COSTS,
  getProductById,
} from '../config/credits.js';
import * as phonepe from '../services/phonepe.service.js';

function apiBaseUrl(req) {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * Adds the purchased credits to the buyer exactly once, guarded by the
 * `created/pending -> paid` status transition (idempotent).
 */
async function finalizePayment(merchantTransactionId, { providerPaymentId = '', raw } = {}) {
  const payment = await Payment.findOneAndUpdate(
    { merchantTransactionId, status: { $ne: 'paid' } },
    { status: 'paid', paidAt: new Date(), providerPaymentId, raw },
    { new: true }
  );
  if (!payment) return null; // already finalized or not found
  await changeBalance({
    userId: payment.user,
    amount: payment.credits,
    reason: 'purchase',
    note: `Payment ${merchantTransactionId} (${payment.credits} credits)`,
  });
  return payment;
}

/**
 * @route GET /api/payments/products
 * @desc  Public product catalogue + pricing (and balance if authenticated)
 * @access Public (optional auth)
 */
export const getProducts = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      products: CREDIT_PRODUCTS,
      unitPrice: CREDIT_UNIT_PRICE,
      linkCosts: LINK_COSTS,
      gatewayConfigured: phonepe.isConfigured(),
      creditBalance: req.user?.creditBalance ?? null,
    },
  });
});

/**
 * @route POST /api/payments/create
 * @desc  Create a credit purchase order and start the gateway payment
 * @access Private
 */
export const createPayment = asyncHandler(async (req, res) => {
  const product = getProductById(req.body.productId);
  if (!product) {
    res.status(400);
    throw new Error('Please choose a valid credit product');
  }

  const merchantTransactionId = `MAA${Date.now()}${crypto.randomBytes(4).toString('hex')}`;

  const payment = await Payment.create({
    user: req.user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    merchantTransactionId,
    status: 'created',
    mock: !phonepe.isConfigured(),
  });

  const redirectUrl = `${env.clientUrl}/payment/return`;
  const callbackUrl = `${apiBaseUrl(req)}/api/payments/phonepe/callback`;

  const { redirectUrl: gatewayUrl, mock } = await phonepe.initiatePayment({
    merchantTransactionId,
    amountRupees: product.price,
    userId: req.user._id,
    redirectUrl,
    callbackUrl,
  });

  payment.status = 'pending';
  await payment.save();

  res.status(201).json({
    success: true,
    data: { redirectUrl: gatewayUrl, merchantTransactionId, mock },
  });
});

/**
 * @route GET /api/payments/status/:mtid
 * @desc  Check (and finalize) a payment's status; credits are granted on success
 * @access Private
 */
export const getPaymentStatus = asyncHandler(async (req, res) => {
  const { mtid } = req.params;
  let payment = await Payment.findOne({ merchantTransactionId: mtid });
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  const isOwner = payment.user.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not allowed');
  }

  if (payment.status !== 'paid') {
    const { paid, raw } = await phonepe.checkStatus(mtid);
    if (paid) {
      const finalized = await finalizePayment(mtid, { raw });
      if (finalized) payment = finalized;
    }
  }

  const fresh = await Payment.findOne({ merchantTransactionId: mtid });
  res.status(200).json({
    success: true,
    data: { status: fresh.status, credits: fresh.credits, amount: fresh.amount },
  });
});

/**
 * @route POST /api/payments/phonepe/callback
 * @desc  Server-to-server payment confirmation from PhonePe
 * @access Public (verified via X-VERIFY checksum)
 */
export const phonepeCallback = asyncHandler(async (req, res) => {
  const responseBase64 = req.body?.response;
  const xVerify = req.headers['x-verify'];

  if (!responseBase64 || !phonepe.verifyCallbackChecksum(responseBase64, xVerify)) {
    res.status(400);
    throw new Error('Invalid callback signature');
  }

  let decoded = {};
  try {
    decoded = JSON.parse(Buffer.from(responseBase64, 'base64').toString('utf8'));
  } catch {
    res.status(400);
    throw new Error('Malformed callback payload');
  }

  const mtid = decoded?.data?.merchantTransactionId;
  const success = decoded?.code === 'PAYMENT_SUCCESS' || decoded?.data?.state === 'COMPLETED';
  if (mtid && success) {
    await finalizePayment(mtid, {
      providerPaymentId: decoded?.data?.transactionId || '',
      raw: decoded,
    });
  } else if (mtid) {
    await Payment.findOneAndUpdate(
      { merchantTransactionId: mtid, status: { $ne: 'paid' } },
      { status: 'failed', raw: decoded }
    );
  }

  res.status(200).json({ success: true });
});

/**
 * @route GET /api/payments/mine
 * @access Private
 */
export const listMyPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.status(200).json({ success: true, data: payments });
});
