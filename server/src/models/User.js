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
      // 'admin' = super admin (MaaEvents9). 'customer' = admin-created client.
      // Legacy 'user'/'organizer' kept for backward compatibility (treated as customer).
      enum: ['user', 'organizer', 'customer', 'admin'],
      default: 'customer',
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
