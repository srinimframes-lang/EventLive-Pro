import mongoose from 'mongoose';
import crypto from 'crypto';

const { Schema, model } = mongoose;

/**
 * A customer-owned custom domain for white-label hosting
 * (e.g. live.ramstudios.com). A domain only becomes usable once the Super Admin
 * approves it AND DNS ownership is verified; only then is `status: 'active'`.
 */
const domainSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    host: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // hostname only (no scheme / path / port)
      match: [/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, 'Enter a valid domain like live.example.com'],
      index: true,
    },
    // pending  → awaiting DNS verification / admin approval
    // active   → verified + approved; serves the customer's branded site
    // suspended→ temporarily disabled by the Super Admin
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended'],
      default: 'pending',
      index: true,
    },
    // Random token the customer publishes as a TXT record to prove ownership.
    verifyToken: { type: String, default: () => crypto.randomBytes(16).toString('hex') },
    dnsVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    lastCheckedAt: { type: Date },
    // SSL/issuance status — updated from Vercel when the integration is enabled,
    // otherwise a manual marker.
    sslStatus: {
      type: String,
      enum: ['pending', 'issued', 'error', 'manual'],
      default: 'pending',
    },
    // Whether the domain has been attached to the hosting project (Vercel).
    hostingAttached: { type: Boolean, default: false },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

// The DNS record we ask the customer to add to prove ownership.
domainSchema.virtual('verification').get(function verification() {
  return {
    type: 'TXT',
    name: `_eventlive-verify.${this.host}`,
    value: this.verifyToken,
    // CNAME the customer points at the hosting provider so the site + SSL work.
    cname: { type: 'CNAME', name: this.host, value: 'cname.vercel-dns.com' },
  };
});

domainSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Domain = model('Domain', domainSchema);
