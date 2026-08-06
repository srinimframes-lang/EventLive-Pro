import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const PAYMENT_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
export const PAYMENT_METHODS = ['upi_qr', 'razorpay'];

/**
 * Credit-purchase record.
 *
 * - method=upi_qr: customer pays manually; admin approves → credits added.
 * - method=razorpay: Checkout + verify/webhook; credits added once on success.
 *
 * Credits are NEVER taken from client-supplied amounts — only from server
 * CREDIT_PRODUCTS at create time, then granted from this stored snapshot.
 */
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, default: '' },
    credits: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }, // in ₹ (server-authoritative)
    currency: { type: String, default: 'INR' },

    method: { type: String, enum: PAYMENT_METHODS, default: 'upi_qr' },
    // Optional UPI reference / UTR, or Razorpay payment id once captured.
    reference: { type: String, default: '', trim: true },

    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },

    // Razorpay Checkout fields (empty for UPI).
    razorpayOrderId: { type: String, default: '', trim: true },
    razorpayPaymentId: { type: String, default: '', trim: true },
    razorpaySignature: { type: String, default: '', trim: true },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

// One Razorpay order / payment id maps to at most one Payment document.
paymentSchema.index(
  { razorpayOrderId: 1 },
  { unique: true, partialFilterExpression: { razorpayOrderId: { $gt: '' } } }
);
paymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $gt: '' } } }
);

paymentSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.razorpaySignature; // never expose signature to clients
    return ret;
  },
});

export const Payment = model('Payment', paymentSchema);
