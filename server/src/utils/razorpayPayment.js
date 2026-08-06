import { Payment } from '../models/Payment.js';
import { changeBalance } from './credits.js';

/**
 * Atomically claim a pending Razorpay Payment and grant credits exactly once.
 *
 * Concurrent verify + webhook calls: only the first successful
 * findOneAndUpdate(status: pending → approved) grants credits.
 *
 * @returns {{ granted: boolean, payment: import('mongoose').Document|null, reason: string }}
 */
export async function finalizeRazorpayPayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature = '',
  source = 'verify',
}) {
  const orderId = String(razorpayOrderId || '').trim();
  const paymentId = String(razorpayPaymentId || '').trim();
  if (!orderId || !paymentId) {
    return { granted: false, payment: null, reason: 'missing_ids' };
  }

  // Fast path: this Razorpay payment id was already applied.
  const byPayId = await Payment.findOne({ razorpayPaymentId: paymentId, status: 'approved' });
  if (byPayId) {
    return { granted: false, payment: byPayId, reason: 'duplicate_payment_id' };
  }

  const reviewNote =
    source === 'webhook'
      ? 'Auto-approved via Razorpay webhook'
      : 'Auto-approved via Razorpay Checkout verification';

  let payment;
  try {
    payment = await Payment.findOneAndUpdate(
      {
        razorpayOrderId: orderId,
        status: 'pending',
        method: 'razorpay',
      },
      {
        $set: {
          status: 'approved',
          razorpayPaymentId: paymentId,
          razorpaySignature: String(razorpaySignature || '').slice(0, 256),
          reviewedAt: new Date(),
          reviewNote,
          reference: paymentId,
        },
      },
      { new: true }
    );
  } catch (err) {
    // Unique index on razorpayPaymentId — another worker won the race.
    if (err?.code === 11000) {
      const existing = await Payment.findOne({
        $or: [{ razorpayPaymentId: paymentId }, { razorpayOrderId: orderId }],
      });
      return { granted: false, payment: existing, reason: 'duplicate_race' };
    }
    throw err;
  }

  if (!payment) {
    const existing = await Payment.findOne({ razorpayOrderId: orderId });
    return {
      granted: false,
      payment: existing,
      reason: existing?.status === 'approved' ? 'already_approved' : 'not_pending',
    };
  }

  await changeBalance({
    userId: payment.user,
    amount: payment.credits,
    reason: 'purchase',
    note: `Razorpay ${source}: ${payment.credits} credit(s) · ${paymentId}`,
  });

  return { granted: true, payment, reason: 'granted' };
}
