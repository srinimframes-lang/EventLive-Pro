import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const PAYMENT_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * A manual UPI credit-purchase request.
 *
 * The customer pays to the company UPI/QR, then submits a request. The Super
 * Admin verifies the payment and approves (credits are added) or rejects it.
 * Credits are NEVER added automatically — only on explicit admin approval.
 */
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, default: '' },
    credits: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }, // in ₹
    currency: { type: String, default: 'INR' },

    method: { type: String, default: 'upi_qr' },
    // Optional UPI reference / UTR the customer can provide to help verification.
    reference: { type: String, default: '', trim: true },

    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

paymentSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Payment = model('Payment', paymentSchema);
