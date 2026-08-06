import { Payment } from '../models/Payment.js';
import { Settings } from '../models/Settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  CREDIT_PRODUCTS,
  CREDIT_UNIT_PRICE,
  LINK_COSTS,
  getProductById,
} from '../config/credits.js';
import {
  getPublicRazorpayKeyId,
  getRazorpayClient,
  inrToPaise,
  isRazorpayConfigured,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../utils/razorpay.js';
import { finalizeRazorpayPayment } from '../utils/razorpayPayment.js';

/**
 * @route GET /api/payments/products
 * @desc  Product catalogue, pricing, UPI + Razorpay availability (public key only)
 * @access Public (optional auth)
 */
export const getProducts = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  const p = settings.payment || {};
  const razorpayOn = isRazorpayConfigured();
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
        phonepeNumber: p.phonepeNumber || '',
        gpayNumber: p.gpayNumber || '',
        instructions: p.instructions || '',
      },
      razorpay: {
        enabled: razorpayOn,
        keyId: razorpayOn ? getPublicRazorpayKeyId() : '',
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

  // Ignore any client-supplied amount/credits — server catalogue only.
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
 * @route POST /api/payments/razorpay/create-order
 * @desc  Create a Razorpay order + pending Payment (server sets amount/credits)
 * @access Private
 */
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  if (!isRazorpayConfigured()) {
    res.status(503);
    throw new Error('Razorpay is not configured. Please use UPI payment or contact support.');
  }

  const product = getProductById(req.body.productId);
  if (!product) {
    res.status(400);
    throw new Error('Please choose a valid credit product');
  }

  // Reject tampered client amounts — only productId is accepted.
  if (req.body.amount != null || req.body.credits != null || req.body.price != null) {
    res.status(400);
    throw new Error('Amount and credits are set by the server. Send productId only.');
  }

  const openCount = await Payment.countDocuments({
    user: req.user._id,
    status: 'pending',
    method: 'razorpay',
  });
  if (openCount >= 5) {
    res.status(429);
    throw new Error('You already have several open Razorpay checkouts. Finish or cancel one first.');
  }

  const payment = await Payment.create({
    user: req.user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    currency: 'INR',
    method: 'razorpay',
    status: 'pending',
  });

  const client = getRazorpayClient();
  let order;
  try {
    order = await client.orders.create({
      amount: inrToPaise(product.price),
      currency: 'INR',
      receipt: String(payment._id).slice(0, 40),
      notes: {
        paymentId: String(payment._id),
        productId: product.id,
        userId: String(req.user._id),
        credits: String(product.credits),
      },
    });
  } catch (err) {
    payment.status = 'cancelled';
    payment.reviewNote = `Razorpay order create failed: ${String(err.message || err).slice(0, 200)}`;
    await payment.save();
    res.status(502);
    throw new Error('Could not start Razorpay checkout. Please try again or use UPI.');
  }

  payment.razorpayOrderId = order.id;
  await payment.save();

  res.status(201).json({
    success: true,
    data: {
      keyId: getPublicRazorpayKeyId(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      paymentId: payment.id,
      product: {
        id: product.id,
        name: product.name,
        credits: product.credits,
        price: product.price,
      },
      prefill: {
        name: req.user.name || '',
        email: req.user.email || '',
        contact: req.user.phone || '',
      },
    },
  });
});

/**
 * @route POST /api/payments/razorpay/verify
 * @desc  Verify Checkout signature and grant credits once
 * @access Private
 */
export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  if (!isRazorpayConfigured()) {
    res.status(503);
    throw new Error('Razorpay is not configured');
  }

  const orderId = String(req.body.razorpay_order_id || req.body.orderId || '').trim();
  const rzPaymentId = String(req.body.razorpay_payment_id || req.body.paymentId || '').trim();
  const signature = String(req.body.razorpay_signature || req.body.signature || '').trim();

  if (!orderId || !rzPaymentId || !signature) {
    res.status(400);
    throw new Error('Missing Razorpay order id, payment id, or signature');
  }

  if (!verifyCheckoutSignature({ orderId, paymentId: rzPaymentId, signature })) {
    res.status(400);
    throw new Error('Invalid payment signature');
  }

  // Ensure the pending payment belongs to this user (prevents verifying someone else's order).
  const owned = await Payment.findOne({
    razorpayOrderId: orderId,
    user: req.user._id,
    method: 'razorpay',
  });
  if (!owned) {
    res.status(404);
    throw new Error('Payment order not found for your account');
  }

  const result = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPaymentId,
    razorpaySignature: signature,
    source: 'verify',
  });

  if (!result.payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  if (result.payment.status === 'cancelled') {
    res.status(409);
    throw new Error('This checkout was cancelled');
  }

  const populated = await Payment.findById(result.payment._id).populate(
    'user',
    'name email creditBalance'
  );

  res.status(200).json({
    success: true,
    data: {
      payment: populated,
      granted: result.granted,
      creditBalance: populated.user?.creditBalance ?? null,
      message: result.granted
        ? `Added ${result.payment.credits} credit(s) to your balance.`
        : 'Payment already processed. Credits were not added again.',
    },
  });
});

/**
 * @route POST /api/payments/razorpay/cancel
 * @desc  Mark a pending Razorpay checkout as cancelled (no credits)
 * @access Private
 */
export const cancelRazorpayPayment = asyncHandler(async (req, res) => {
  const orderId = String(req.body.orderId || req.body.razorpay_order_id || '').trim();
  const paymentDocId = String(req.body.paymentId || '').trim();

  const filter = {
    user: req.user._id,
    method: 'razorpay',
    status: 'pending',
  };
  if (orderId) filter.razorpayOrderId = orderId;
  else if (paymentDocId) filter._id = paymentDocId;
  else {
    res.status(400);
    throw new Error('orderId or paymentId is required');
  }

  const payment = await Payment.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'cancelled',
        reviewedAt: new Date(),
        reviewNote: 'Checkout cancelled by customer',
      },
    },
    { new: true }
  );

  if (!payment) {
    // Already finalized or not found — not an error for UX.
    const existing = await Payment.findOne({
      user: req.user._id,
      method: 'razorpay',
      ...(orderId ? { razorpayOrderId: orderId } : paymentDocId ? { _id: paymentDocId } : {}),
    });
    return res.status(200).json({
      success: true,
      data: { payment: existing, cancelled: false },
    });
  }

  res.status(200).json({ success: true, data: { payment, cancelled: true } });
});

/**
 * @route POST /api/payments/razorpay/webhook
 * @desc  Razorpay webhook (raw body). Grants credits once on payment.captured.
 * @access Public (signature-verified)
 *
 * Mounted in app.js with express.raw before JSON parser.
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  if (!String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim()) {
    res.status(503);
    throw new Error('Webhook secret not configured');
  }

  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer when mounted with express.raw

  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(400);
    throw new Error('Invalid webhook signature');
  }

  let event;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
    event = JSON.parse(text);
  } catch {
    res.status(400);
    throw new Error('Invalid webhook JSON');
  }

  const eventName = event?.event || '';
  // Capture is the authoritative paid signal for Checkout.
  if (eventName === 'payment.captured' || eventName === 'payment.authorized') {
    const entity = event?.payload?.payment?.entity;
    const orderId = entity?.order_id;
    const paymentId = entity?.id;
    if (orderId && paymentId) {
      await finalizeRazorpayPayment({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: String(signature || ''),
        source: 'webhook',
      });
    }
  }

  // Always ACK quickly so Razorpay does not retry endlessly on business no-ops.
  res.status(200).json({ success: true });
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
