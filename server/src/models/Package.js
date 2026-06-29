import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A bookable wedding live-streaming package (price + features) managed by admin.
 */
const packageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', trim: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    features: { type: [String], default: [] },
    durationLabel: { type: String, default: '', trim: true }, // e.g. "Up to 6 hours"
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

packageSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Package = model('Package', packageSchema);
