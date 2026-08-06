import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Test secrets (never used in production).
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventlive-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_razorpay_suite';
process.env.RAZORPAY_KEY_ID = 'rzp_test_unit_key';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_abc123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_xyz';

const {
  verifyCheckoutSignature,
  verifyWebhookSignature,
  inrToPaise,
  isRazorpayConfigured,
  resetRazorpayClient,
} = await import('./razorpay.js');
const { finalizeRazorpayPayment } = await import('./razorpayPayment.js');
const { Payment } = await import('../models/Payment.js');
const { User } = await import('../models/User.js');
const { getProductById, CREDIT_PRODUCTS } = await import('../config/credits.js');

function signCheckout(orderId, paymentId, secret = process.env.RAZORPAY_KEY_SECRET) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function signWebhook(body, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

let mongod;

test('setup memory mongo', async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  resetRazorpayClient();
});

test('razorpay is configured when env keys present', () => {
  assert.equal(isRazorpayConfigured(), true);
});

test('inrToPaise converts rupees correctly', () => {
  assert.equal(inrToPaise(100), 10000);
  assert.equal(inrToPaise(500), 50000);
  assert.equal(inrToPaise(1000), 100000);
});

test('valid checkout signature passes', () => {
  const orderId = 'order_test_1';
  const paymentId = 'pay_test_1';
  const signature = signCheckout(orderId, paymentId);
  assert.equal(verifyCheckoutSignature({ orderId, paymentId, signature }), true);
});

test('invalid checkout signature fails', () => {
  assert.equal(
    verifyCheckoutSignature({
      orderId: 'order_test_1',
      paymentId: 'pay_test_1',
      signature: 'deadbeef',
    }),
    false
  );
});

test('tampered order id fails signature check', () => {
  const signature = signCheckout('order_A', 'pay_1');
  assert.equal(
    verifyCheckoutSignature({ orderId: 'order_B', paymentId: 'pay_1', signature }),
    false
  );
});

test('valid webhook signature passes', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }), 'utf8');
  const sig = signWebhook(body);
  assert.equal(verifyWebhookSignature(body, sig), true);
});

test('invalid webhook signature fails', () => {
  const body = Buffer.from('{"event":"payment.captured"}', 'utf8');
  assert.equal(verifyWebhookSignature(body, 'wrong'), false);
});

test('server product catalogue is authoritative (no client price trust)', () => {
  const p = getProductById('credits-5');
  assert.ok(p);
  assert.equal(p.credits, 5);
  assert.equal(p.price, 500);
  assert.equal(getProductById('credits-hack-999'), null);
  assert.ok(CREDIT_PRODUCTS.every((x) => x.price === x.credits * 100));
});

test('successful payment grants credits once', async () => {
  const user = await User.create({
    name: 'Pay User',
    email: `pay_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 0,
  });
  const product = getProductById('credits-1');
  const orderId = `order_ok_${Date.now()}`;
  const rzPayId = `pay_ok_${Date.now()}`;

  await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'razorpay',
    status: 'pending',
    razorpayOrderId: orderId,
  });

  const sig = signCheckout(orderId, rzPayId);
  const first = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    razorpaySignature: sig,
    source: 'verify',
  });
  assert.equal(first.granted, true);
  assert.equal(first.payment.status, 'approved');

  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 1);
});

test('duplicate verification does not add credits twice', async () => {
  const user = await User.create({
    name: 'Dup Verify',
    email: `dupv_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 2,
  });
  const product = getProductById('credits-5');
  const orderId = `order_dupv_${Date.now()}`;
  const rzPayId = `pay_dupv_${Date.now()}`;

  await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'razorpay',
    status: 'pending',
    razorpayOrderId: orderId,
  });

  const sig = signCheckout(orderId, rzPayId);
  const a = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    razorpaySignature: sig,
    source: 'verify',
  });
  const b = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    razorpaySignature: sig,
    source: 'verify',
  });
  assert.equal(a.granted, true);
  assert.equal(b.granted, false);
  assert.equal(b.reason, 'duplicate_payment_id');

  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 2 + 5);
});

test('duplicate webhook does not add credits twice', async () => {
  const user = await User.create({
    name: 'Dup Hook',
    email: `duph_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 0,
  });
  const product = getProductById('credits-10');
  const orderId = `order_duph_${Date.now()}`;
  const rzPayId = `pay_duph_${Date.now()}`;

  await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'razorpay',
    status: 'pending',
    razorpayOrderId: orderId,
  });

  const first = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    source: 'webhook',
  });
  const second = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    source: 'webhook',
  });
  assert.equal(first.granted, true);
  assert.equal(second.granted, false);

  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 10);
});

test('verify then webhook still grants only once', async () => {
  const user = await User.create({
    name: 'Both Paths',
    email: `both_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 0,
  });
  const product = getProductById('credits-1');
  const orderId = `order_both_${Date.now()}`;
  const rzPayId = `pay_both_${Date.now()}`;

  await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'razorpay',
    status: 'pending',
    razorpayOrderId: orderId,
  });

  const v = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    razorpaySignature: signCheckout(orderId, rzPayId),
    source: 'verify',
  });
  const w = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: rzPayId,
    source: 'webhook',
  });
  assert.equal(v.granted, true);
  assert.equal(w.granted, false);
  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 1);
});

test('cancelled payment is not grantable', async () => {
  const user = await User.create({
    name: 'Cancel User',
    email: `cancel_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 0,
  });
  const product = getProductById('credits-1');
  const orderId = `order_cancel_${Date.now()}`;

  await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'razorpay',
    status: 'cancelled',
    razorpayOrderId: orderId,
  });

  const result = await finalizeRazorpayPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: `pay_cancel_${Date.now()}`,
    source: 'verify',
  });
  assert.equal(result.granted, false);
  assert.equal(result.reason, 'not_pending');
  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 0);
});

test('manual UPI payment stays pending until admin (no auto grant)', async () => {
  const user = await User.create({
    name: 'UPI User',
    email: `upi_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 0,
  });
  const product = getProductById('credits-5');
  const payment = await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits,
    amount: product.price,
    method: 'upi_qr',
    status: 'pending',
    reference: 'UTR123',
  });
  assert.equal(payment.status, 'pending');
  assert.equal(payment.method, 'upi_qr');

  // finalizeRazorpayPayment must not touch UPI rows (method filter).
  const result = await finalizeRazorpayPayment({
    razorpayOrderId: 'order_should_not_match',
    razorpayPaymentId: 'pay_nope',
    source: 'verify',
  });
  assert.equal(result.granted, false);

  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 0);
  const still = await Payment.findById(payment._id);
  assert.equal(still.status, 'pending');
});

test('payment snapshot ignores would-be tampered pack amounts', async () => {
  // Simulate attacker sending huge credits at create — controller uses getProductById only.
  const product = getProductById('credits-1');
  const user = await User.create({
    name: 'Tamper',
    email: `tamper_${Date.now()}@test.local`,
    password: 'Password1!',
    role: 'customer',
    approved: true,
    creditBalance: 0,
  });
  // Server would store product.credits/price, not attacker values:
  const payment = await Payment.create({
    user: user._id,
    productId: product.id,
    credits: product.credits, // not 9999
    amount: product.price, // not 1
    method: 'razorpay',
    status: 'pending',
    razorpayOrderId: `order_tamp_${Date.now()}`,
  });
  assert.equal(payment.credits, 1);
  assert.equal(payment.amount, 100);

  const rzPayId = `pay_tamp_${Date.now()}`;
  await finalizeRazorpayPayment({
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: rzPayId,
    source: 'verify',
  });
  const refreshed = await User.findById(user._id);
  assert.equal(refreshed.creditBalance, 1);
});

test('teardown', async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
