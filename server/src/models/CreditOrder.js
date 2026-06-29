import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const ORDER_STATUSES = ['pending', 'approved', 'rejected'];
export const ORDER_CREDIT_TYPES = ['youtube', 'server'];

/**
 * A reseller's request to top-up credits. When paid online the order can be
 * auto-approved by a gateway webhook; otherwise the Super Admin verifies the
 * payment proof and approves it, which grants the credits.
 */
const creditOrderSchema = new Schema(
  {
    subAdmin: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ORDER_CREDIT_TYPES, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 }, // ₹ per credit at order time
    amount: { type: Number, required: true, min: 0 }, // quantity * unitPrice

    paymentMethod: { type: String, default: '', trim: true }, // gpay / phonepe / upi / bank
    paymentReference: { type: String, default: '', trim: true }, // UTR / txn id
    paymentScreenshot: { type: String, default: '' },

    // 'manual' = admin verifies proof; 'gateway' = auto via payment gateway.
    channel: { type: String, enum: ['manual', 'gateway'], default: 'manual' },
    gatewayOrderId: { type: String, default: '', trim: true },
    gatewayPaymentId: { type: String, default: '', trim: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    adminNote: { type: String, default: '', trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

creditOrderSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const CreditOrder = model('CreditOrder', creditOrderSchema);
