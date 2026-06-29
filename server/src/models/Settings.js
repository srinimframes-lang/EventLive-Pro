import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Site-wide configuration editable by the Super Admin (no code changes needed):
 * branding, contact, and payment details shown to customers during booking.
 * Stored as a single document (singleton).
 */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true, index: true },

    // ── Branding ──────────────────────────────────────────────
    companyName: { type: String, default: 'MaaEvents9 Broadcasting Services', trim: true },
    companyLogo: { type: String, default: '' },
    tagline: { type: String, default: 'Premium Wedding Live Streaming', trim: true },

    // ── Contact ───────────────────────────────────────────────
    whatsappNumber: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    contactEmail: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },

    // ── Reseller credit pricing (₹ per credit) ────────────────
    creditPricing: {
      youtube: { type: Number, default: 100, min: 0 }, // 1 YouTube event
      server: { type: Number, default: 500, min: 0 }, // 1 private server event
    },

    // ── Payment collection details ────────────────────────────
    payment: {
      gpayNumber: { type: String, default: '', trim: true },
      phonepeNumber: { type: String, default: '', trim: true },
      paytmNumber: { type: String, default: '', trim: true },
      upiId: { type: String, default: '', trim: true },
      upiName: { type: String, default: '', trim: true }, // account/holder name shown under the QR
      upiQr: { type: String, default: '' }, // uploaded QR image URL
      bank: {
        accountName: { type: String, default: '', trim: true },
        accountNumber: { type: String, default: '', trim: true },
        ifsc: { type: String, default: '', trim: true },
        bankName: { type: String, default: '', trim: true },
        branch: { type: String, default: '', trim: true },
      },
    },
  },
  { timestamps: true }
);

settingsSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

/**
 * Returns the singleton settings document, creating it with defaults if absent.
 */
settingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global' });
  return doc;
};

export const Settings = model('Settings', settingsSchema);
