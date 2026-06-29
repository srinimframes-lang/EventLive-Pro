import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const PAYMENT_STATUSES = ['created', 'pending', 'paid', 'failed'];

/**
 * A credit purchase processed through the payment gateway (PhonePe).
 * On a successful payment, `credits` are added to the user's wallet exactly
 * once (guarded by the `paid` status transition).
 */
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, default: '' },
    credits: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }, // in ₹
    currency: { type: String, default: 'INR' },

    provider: { type: String, default: 'phonepe' },
    merchantTransactionId: { type: String, required: true, unique: true, index: true },
    providerPaymentId: { type: String, default: '' },

    status: { type: String, enum: PAYMENT_STATUSES, default: 'created', index: true },
    // True when processed in mock mode (gateway keys not configured yet).
    mock: { type: Boolean, default: false },
    raw: { type: Schema.Types.Mixed },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

paymentSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.raw;
    return ret;
  },
});

export const Payment = model('Payment', paymentSchema);
