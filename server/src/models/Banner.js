import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const BANNER_LOCATIONS = ['homepage', 'live_player', 'gallery', 'footer'];

const bannerSchema = new Schema(
  {
    companyName: { type: String, required: true, trim: true, maxlength: 120 },
    imageUrl: { type: String, required: true, trim: true },
    clickUrl: { type: String, default: '', trim: true, maxlength: 500 },
    phoneNumber: { type: String, default: '', trim: true, maxlength: 30 },
    whatsappNumber: { type: String, default: '', trim: true, maxlength: 30 },
    /** mobile-50 | mobile-100 — display height on small screens */
    mobileSize: { type: String, enum: ['50', '100'], default: '50' },
    locations: {
      type: [String],
      enum: BANNER_LOCATIONS,
      default: [],
      index: true,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    enabled: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 0, index: true },
    views: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

bannerSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Banner = model('Banner', bannerSchema);
