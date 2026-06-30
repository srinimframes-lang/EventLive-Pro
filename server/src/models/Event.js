import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const EVENT_STATUSES = ['draft', 'published', 'live', 'ended', 'cancelled'];
export const EVENT_CATEGORIES = [
  'conference',
  'workshop',
  'webinar',
  'concert',
  'meetup',
  'sports',
  'other',
];

/**
 * Generates a URL-friendly slug from a title.
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Unambiguous alphabet for short codes (no I/O/0/1 to avoid confusion).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSegment(len) {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * A short, human-friendly prefix from the couple's (or title's) initials,
 * e.g. "Aarav & Priya" -> "AP". Returns up to 2 uppercase letters.
 */
function codePrefix(doc) {
  const source = `${doc.groomName || ''} ${doc.brideName || ''}`.trim() || doc.title || '';
  const letters = source
    .replace(/[^a-zA-Z]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return letters.slice(0, 2);
}

const eventSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [120, 'Title must be at most 120 characters'],
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    // Short, shareable public code used in /live/<shortCode> URLs (e.g. "AP24X9").
    shortCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [5000, 'Description must be at most 5000 characters'],
    },
    organizer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Commercial booking that produced this event (admin-approved payment).
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
      default: null,
    },
    category: {
      type: String,
      enum: EVENT_CATEGORIES,
      default: 'other',
      index: true,
    },
    status: {
      type: String,
      enum: EVENT_STATUSES,
      default: 'draft',
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
      validate: {
        validator: function validateEnd(value) {
          return !this.startTime || value > this.startTime;
        },
        message: 'End time must be after start time',
      },
    },
    location: {
      type: String,
      trim: true,
      default: 'Online',
    },
    // Physical venue of the ceremony (shown even for online/streamed weddings).
    venue: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
    },
    isOnline: {
      type: Boolean,
      default: true,
    },
    streamUrl: {
      type: String,
      trim: true,
      default: '',
    },

    // ── Wedding / couple details ──────────────────────────────
    brideName: { type: String, trim: true, default: '', maxlength: 80 },
    groomName: { type: String, trim: true, default: '', maxlength: 80 },

    // ── Photography branding ──────────────────────────────────
    photographerName: { type: String, trim: true, default: '', maxlength: 120 },
    photographerLogo: { type: String, trim: true, default: '' },

    // ── Photo gallery ─────────────────────────────────────────
    gallery: {
      type: [
        new Schema(
          {
            url: { type: String, required: true, trim: true },
            caption: { type: String, trim: true, default: '', maxlength: 200 },
          },
          { timestamps: { createdAt: true, updatedAt: false } }
        ),
      ],
      default: [],
    },

    // ── Live streaming (Phase 3) ──────────────────────────────
    streamProvider: {
      type: String,
      enum: ['none', 'youtube', 'hls', 'webrtc', 'rtmp'],
      default: 'none',
    },
    youtubeVideoId: { type: String, trim: true, default: '' },
    hlsUrl: { type: String, trim: true, default: '' },
    webrtcUrl: { type: String, trim: true, default: '' },
    // Whether the live chat panel is shown on the public watch page.
    chatEnabled: { type: Boolean, default: true },
    // Reseller bookkeeping: which credit type was consumed to create this event
    // and the role of the creator ('admin' events consume no credits).
    creditType: { type: String, enum: ['youtube', 'server', 'none'], default: 'none' },
    createdByRole: { type: String, default: '' },
    // Secret RTMP ingest key — never returned unless explicitly selected.
    rtmpStreamKey: { type: String, default: '', select: false },
    // Private-server controls (Phase 2). Additive — defaults keep prior behaviour.
    streamDisabled: { type: Boolean, default: false }, // admin can block publishing
    autoRecord: { type: Boolean, default: false }, // record the private-server stream
    recordingUrl: { type: String, trim: true, default: '' }, // set by media server
    isLive: { type: Boolean, default: false, index: true },
    liveStartedAt: { type: Date },
    liveEndedAt: { type: Date },
    peakViewers: { type: Number, default: 0, min: 0 },
    totalViews: { type: Number, default: 0, min: 0 }, // cumulative unique-ish joins

    coverImage: {
      type: String,
      trim: true,
      default: '',
    },
    capacity: {
      type: Number,
      min: [0, 'Capacity cannot be negative'],
      default: 0,
    },
    attendeesCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Text index to support search across title/description.
eventSchema.index({ title: 'text', description: 'text' });

/**
 * Generates a unique short code for an event: an initials prefix plus a random
 * segment (widening on repeated collisions). Used for /live/<shortCode> URLs.
 */
eventSchema.statics.generateUniqueShortCode = async function generateUniqueShortCode(doc) {
  const prefix = codePrefix(doc);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const segLen = 4 + Math.floor(attempt / 12); // 4, then 5, 6…
    const candidate = `${prefix}${randomSegment(segLen)}`;
    // eslint-disable-next-line no-await-in-loop
    const clash = await this.exists({ shortCode: candidate, _id: { $ne: doc._id } });
    if (!clash) return candidate;
  }
  return `${prefix}${randomSegment(10)}`;
};

// Assign a unique slug (from the title) and a stable short code before
// validation. Implemented as a single async hook (no `next()`), since mixing
// `next()` with async hooks can cause later hooks to be skipped.
eventSchema.pre('validate', async function ensureSlugAndShortCode() {
  if (this.isModified('title') || !this.slug) {
    const base = slugify(this.title || '') || 'event';
    let candidate = base;
    let counter = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.constructor.exists({ slug: candidate, _id: { $ne: this._id } })) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }
    this.slug = candidate;
  }

  if (!this.shortCode) {
    this.shortCode = await this.constructor.generateUniqueShortCode(this);
  }
});

eventSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Event = model('Event', eventSchema);
