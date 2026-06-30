import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name must be at most 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      // 'admin'    = super admin (MaaEvents9, full control).
      // 'subadmin' = reseller; buys credits and creates events (1 credit each).
      // 'customer' = self/admin-created client who books packages.
      // Legacy 'user'/'organizer' kept for backward compatibility.
      enum: ['user', 'organizer', 'customer', 'subadmin', 'admin'],
      default: 'customer',
    },
    // Unified credit wallet. Credits are purchased via the payment gateway and
    // deducted when a live link is created (YouTube = 1, Server = 5).
    creditBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Legacy reseller two-wallet field (kept for backward compatibility).
    credits: {
      youtube: { type: Number, default: 0, min: 0 },
      server: { type: Number, default: 0, min: 0 },
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    // Whether the account can log in (admins can deactivate customers).
    isActive: {
      type: Boolean,
      default: true,
    },
    // Self-registered customers start unapproved and cannot book until the
    // Super Admin approves them. Admin-created accounts are pre-approved.
    approved: {
      type: Boolean,
      default: false,
    },
    // Optional phone for customer contact.
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    // Which admin created this account (null for the seeded super admin).
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // ── White-label branding (Phase 3) ───────────────────────────
    // Shown on the customer's own custom-domain site instead of the default
    // platform branding. All optional; empty values fall back to the platform
    // Settings (MaaEvents9 / EventLive Pro), so existing accounts are unaffected.
    branding: {
      businessName: { type: String, default: '', trim: true, maxlength: 80 },
      logoUrl: { type: String, default: '' },
      tagline: { type: String, default: '', trim: true, maxlength: 120 },
      primaryColor: { type: String, default: '', trim: true }, // hex, e.g. #be185d
      whatsappNumber: { type: String, default: '', trim: true },
      contactPhone: { type: String, default: '', trim: true },
      contactEmail: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true, maxlength: 200 },
      footer: { type: String, default: '', trim: true, maxlength: 300 },
    },
  },
  { timestamps: true }
);

// Hash the password before saving when it has been modified.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

// Instance helper to compare a candidate password with the stored hash.
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak the password hash when serialising to JSON.
userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export const User = model('User', userSchema);
