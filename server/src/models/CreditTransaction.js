import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const CREDIT_TYPES = ['youtube', 'server'];
export const CREDIT_REASONS = [
  'manual_add', // Super Admin granted credits
  'manual_remove', // Super Admin removed credits
  'purchase', // approved online/credit order
  'event_deduct', // 1 credit consumed when creating an event
  'refund', // credit returned (e.g. failed event creation)
];

/**
 * Immutable ledger entry recording every change to a reseller's credit balance.
 * Positive `amount` adds credits, negative removes them.
 */
const creditTransactionSchema = new Schema(
  {
    subAdmin: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: CREDIT_TYPES, required: true },
    amount: { type: Number, required: true }, // signed
    reason: { type: String, enum: CREDIT_REASONS, required: true },
    balanceAfter: { type: Number, default: 0 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    event: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
    order: { type: Schema.Types.ObjectId, ref: 'CreditOrder', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

creditTransactionSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const CreditTransaction = model('CreditTransaction', creditTransactionSchema);
