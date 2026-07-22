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
    // Whether Vercel has verified the domain on the project (config correct).
    hostingVerified: { type: Boolean, default: false },
    // Extra DNS records Vercel may require to verify the domain (rendered to the
    // customer when present). [{ type, domain, value, reason }]
    hostingRecords: { type: Array, default: [] },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

// Compound lookup used when resolving an organizer's active brand domain.
domainSchema.index({ customer: 1, status: 1 });

const DNS_TTL_SECONDS = 3600;

/** Recommended DNS records for ownership proof + routing/SSL. */
domainSchema.virtual('verification').get(function verification() {
  const token = this.verifyToken || '';
  const txtHost = `_eventlive-verify.${this.host}`;
  const txt = {
    type: 'TXT',
    name: txtHost,
    host: txtHost,
    value: token,
    ttl: DNS_TTL_SECONDS,
  };
  const cname = {
    type: 'CNAME',
    name: this.host,
    host: this.host,
    value: 'cname.vercel-dns.com',
    ttl: DNS_TTL_SECONDS,
  };
  return {
    type: txt.type,
    name: txt.name,
    host: txt.host,
    value: txt.value,
    ttl: DNS_TTL_SECONDS,
    cname: {
      type: cname.type,
      name: cname.name,
      host: cname.host,
      value: cname.value,
      ttl: DNS_TTL_SECONDS,
    },
    // Structured list for admin/customer UI tables.
    records: [txt, cname],
  };
});

/** Ensure every domain has a TXT ownership token (backfill legacy rows). */
domainSchema.methods.ensureVerifyToken = function ensureVerifyToken() {
  if (!this.verifyToken) {
    this.verifyToken = crypto.randomBytes(16).toString('hex');
  }
  return this.verifyToken;
};

domainSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Domain = model('Domain', domainSchema);
