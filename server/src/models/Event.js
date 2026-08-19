import mongoose from 'mongoose';
import { extractYouTubeId } from '../utils/youtube.js';
import { streamKeyFromEventId, syncServerStreamFields } from '../utils/mediaStream.js';
import {
  buildCoupleWatchSlug,
  buildLivePageSlug,
  RESERVED_PUBLIC_ROOTS,
  slugifyName,
} from '../utils/seo.js';

const { Schema, model } = mongoose;

export const EVENT_STATUSES = ['draft', 'published', 'live', 'ended', 'cancelled'];
export const EVENT_CATEGORIES = [
  'wedding',
  'engagement',
  'reception',
  'sangeet',
  'haldi',
  'mehendi',
  'birthday',
  'housewarming',
  'upanayanam',
  'half_saree',
  'baby_shower',
  'house_warming',
  'corporate',
  'temple',
  'memorial',
  'conference',
  'workshop',
  'webinar',
  'concert',
  'meetup',
  'sports',
  'other',
];

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
    // How the public URL is built. New live-link events use /live/{slug}.
    // Missing/legacy values keep existing /{shortCode} or /{bride}-weds-{groom} URLs.
    publicUrlStyle: {
      type: String,
      enum: ['live', 'couple', 'short'],
      default: undefined,
      index: true,
    },
    // Short, shareable public code used in /<shortCode> URLs (e.g. "AP24X9").
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
      trim: true,
      default: '',
      maxlength: [5000, 'Description must be at most 5000 characters'],
    },
    organizer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Tenant admin who owns this live link (multi-tenant isolation).
    // Super Admin sees all; normal Admin only sees createdBy === self.
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    // Public page template (opt-in). Existing events stay on "default".
    pageTemplate: {
      type: String,
      enum: ['default', 'classic-wedding'],
      default: 'default',
      index: true,
    },
    // Classic Wedding (and future templates): hero BG separate from couple photo.
    heroBackgroundImage: { type: String, trim: true, default: '' },
    bridePhoto: { type: String, trim: true, default: '' },
    groomPhoto: { type: String, trim: true, default: '' },

    // ── Photography branding ──────────────────────────────────
    studioName: { type: String, trim: true, default: '', maxlength: 120 },
    photographerName: { type: String, trim: true, default: '', maxlength: 120 },
    photographerLogo: { type: String, trim: true, default: '' },
    studioPhone: { type: String, trim: true, default: '', maxlength: 30 },
    studioWhatsapp: { type: String, trim: true, default: '', maxlength: 30 },
    studioEmail: { type: String, trim: true, default: '', maxlength: 120 },
    studioWebsite: { type: String, trim: true, default: '', maxlength: 300 },
    studioInstagram: { type: String, trim: true, default: '', maxlength: 300 },
    studioFacebook: { type: String, trim: true, default: '', maxlength: 300 },
    studioYoutube: { type: String, trim: true, default: '', maxlength: 300 },
    studioMapsUrl: { type: String, trim: true, default: '', maxlength: 500 },

    // ── Photo gallery (Cloudflare R2) ─────────────────────────
    gallery: {
      type: [
        new Schema(
          {
            // Display URL (API image path, public R2 URL, or legacy Cloudinary/local).
            url: { type: String, required: true, trim: true },
            r2Key: { type: String, trim: true, default: '' },
            filename: { type: String, trim: true, default: '' },
            caption: { type: String, trim: true, default: '', maxlength: 200 },
            order: { type: Number, default: 0, min: 0 },
            isCover: { type: Boolean, default: false },
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
    youtubeBroadcastId: { type: String, trim: true, default: '' },
    youtubeLiveStreamId: { type: String, trim: true, default: '' },
    youtubeWatchUrl: { type: String, trim: true, default: '' },
    hlsUrl: { type: String, trim: true, default: '' },
    webrtcUrl: { type: String, trim: true, default: '' },
    // Whether the live chat panel is shown on the public watch page.
    chatEnabled: { type: Boolean, default: true },
    // Reseller bookkeeping: which credit type was consumed to create this event
    // and the role of the creator ('admin' events consume no credits).
    creditType: { type: String, enum: ['youtube', 'server', 'none'], default: 'none' },
    createdByRole: { type: String, default: '' },
    // Public streaming destination (UI). Additive — missing on legacy docs is fine.
    // server | youtube | server_youtube (HLS on site) | youtube_server (YouTube embed on site).
    streamingDestination: {
      type: String,
      enum: ['server', 'youtube', 'server_youtube', 'youtube_server'],
    },
    // YouTube RTMP ingest (for OBS→YouTube or MediaMTX→YouTube forward).
    youtubeRtmpUrl: { type: String, trim: true, default: '' },
    // YouTube stream key — never returned unless explicitly selected.
    youtubeStreamKey: { type: String, default: '', select: false },
    // When true (server_youtube / youtube_server), MediaMTX forwards RTMP to YouTube.
    youtubeForwardEnabled: { type: Boolean, default: false },
    // Facebook Live RTMP forward (additive; OBS still publishes only to MediaMTX).
    facebookRtmpUrl: { type: String, trim: true, default: '' },
    facebookStreamKey: { type: String, default: '', select: false },
    facebookForwardEnabled: { type: Boolean, default: false },
    // Live Adaptive HLS (1080p + 480p). Default OFF (Standard) — Super Admin opt-in only.
    // Recordings / replay stay original quality either way.
    adaptiveStreaming: { type: Boolean, default: false },
    // Secret RTMP ingest key — never returned unless explicitly selected.
    rtmpStreamKey: { type: String, default: '', select: false },
    // Full OBS publish URL for Premium Server Live (rtmp://host:1935/live/<eventId>).
    rtmpPublishUrl: { type: String, trim: true, default: '' },
    // Private-server controls (Phase 2). Additive — defaults keep prior behaviour.
    streamDisabled: { type: Boolean, default: false }, // admin can block publishing
    autoRecord: { type: Boolean, default: false }, // record the private-server stream

    // ── Server → YouTube failover (additive; inert unless FAILOVER_ENABLED=true) ──
    backupStreamEnabled: { type: Boolean, default: false },
    backupYoutubeVideoId: { type: String, trim: true, default: '' },
    backupStatus: {
      type: String,
      enum: ['idle', 'monitoring', 'active', 'server_recovered', 'disabled'],
      default: 'idle',
    },
    // Effective mode: auto follows health; force_* set by Super Admin emergency.
    playbackMode: {
      type: String,
      enum: ['auto', 'force_server', 'force_youtube'],
      default: 'auto',
    },
    primaryStream: {
      type: String,
      enum: ['server', 'youtube'],
      default: 'server',
    },
    streamHealth: {
      consecutiveFailures: { type: Number, default: 0, min: 0 },
      consecutiveSuccesses: { type: Number, default: 0, min: 0 },
      lastCheckedAt: { type: Date, default: null },
      lastHealthyAt: { type: Date, default: null },
      lastFailoverAt: { type: Date, default: null },
      lastError: { type: String, trim: true, default: '' },
    },
    emergencyOverride: {
      enabled: { type: Boolean, default: false },
      mode: {
        type: String,
        enum: ['none', 'force_server', 'force_youtube', 'disabled'],
        default: 'none',
      },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      updatedAt: { type: Date, default: null },
    },
    // Recorded replay (MediaMTX finalize → MongoDB). File stays on disk 30+ days.
    recordingUrl: { type: String, trim: true, default: '' }, // public/admin play API path
    recordingPath: { type: String, trim: true, default: '' }, // absolute MP4 path on server
    recordingFilename: { type: String, trim: true, default: '' },
    // Cloudflare R2 (durable storage). When set, playback/download come from R2
    // and the local VPS copy has been removed.
    recordingStorage: { type: String, enum: ['local', 'r2'], default: 'local' },
    // Legacy single-pointer fields — always synced to the newest active part.
    recordingR2Key: { type: String, trim: true, default: '' },
    recordingR2Url: { type: String, trim: true, default: '' }, // canonical object URL
    recordingRecordedAt: { type: Date },
    recordingPublicUntil: { type: Date }, // recordedAt + 30 days; public hide after
    recordingDurationSec: { type: Number, default: 0, min: 0 },
    recordingHidden: { type: Boolean, default: false }, // admin hide (or keep after restore window)
    recordingDeletedAt: { type: Date }, // permanent delete timestamp (all parts removed)
    // Multi-session history: every OBS stop creates a new entry; prior parts are kept
    // until post-event merge soft-deletes them in favour of one replay file.
    recordings: [
      {
        r2Key: { type: String, trim: true, default: '' },
        r2Url: { type: String, trim: true, default: '' },
        filename: { type: String, trim: true, default: '' },
        localPath: { type: String, trim: true, default: '' },
        storage: { type: String, enum: ['local', 'r2'], default: 'local' },
        startedAt: { type: Date },
        endedAt: { type: Date },
        durationSec: { type: Number, default: 0, min: 0 },
        sizeBytes: { type: Number, default: 0, min: 0 },
        createdAt: { type: Date, default: Date.now },
        deletedAt: { type: Date },
      },
    ],
    recordingMergeStatus: {
      type: String,
      enum: ['', 'pending', 'merged', 'failed', 'skipped'],
      default: '',
    },
    recordingMergeError: { type: String, trim: true, default: '' },
    recordingMergedAt: { type: Date },
    isLive: { type: Boolean, default: false, index: true },
    // Short OBS drops: keep live + show reconnecting until liveReconnectUntil.
    liveReconnecting: { type: Boolean, default: false },
    liveReconnectUntil: { type: Date },
    liveStartedAt: { type: Date },
    liveEndedAt: { type: Date },
    peakViewers: { type: Number, default: 0, min: 0 },
    totalViews: { type: Number, default: 0, min: 0 }, // cumulative unique-ish joins

    coverImage: {
      type: String,
      trim: true,
      default: '',
    },
    // Generated 1280x720 YouTube-style share/OG thumbnail. Optional; OG falls
    // back to coverImage for existing events that have never generated one.
    shareThumbnail: {
      type: String,
      trim: true,
      default: '',
    },

    // ── Professional theme (snapshot at selection — immune to catalog edits) ──
    theme: {
      type: Schema.Types.ObjectId,
      ref: 'Theme',
      default: null,
    },
    themeSnapshot: {
      name: { type: String, default: '' },
      category: { type: String, default: '' },
      region: { type: String, default: '' },
      backgroundImage: { type: String, default: '' },
      layoutVariant: { type: String, default: 'royal-palace' },
      colors: {
        primary: { type: String, default: '' },
        secondary: { type: String, default: '' },
        accent: { type: String, default: '' },
        heroText: { type: String, default: '' },
        surface: { type: String, default: '' },
        footerBg: { type: String, default: '' },
        footerText: { type: String, default: '' },
      },
      fonts: {
        heading: { type: String, default: '' },
        body: { type: String, default: '' },
      },
      style: {
        decoration: { type: String, default: 'elegant' },
        buttonStyle: { type: String, default: 'pill-glow' },
        iconSet: { type: String, default: 'rings' },
        particleStyle: { type: String, default: 'bokeh' },
        gradientFrom: { type: String, default: '' },
        gradientTo: { type: String, default: '' },
        goldBorder: { type: Boolean, default: false },
        loadingAnimation: { type: String, default: 'gold-shimmer' },
        backgroundMusic: { type: String, default: '' },
      },
      heroLabel: { type: String, default: '' },
      footerText: { type: String, default: '' },
      isPremium: { type: Boolean, default: false },
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
    // How the event was created. Empty for existing live-link / admin flows.
    source: {
      type: String,
      trim: true,
      default: '',
      maxlength: 40,
    },

    // ── Shareable QR (public live URL) ─────────────────────────
    qrCodeImage: { type: String, trim: true, default: '' },
    qrCodeTargetUrl: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// Text index to support search across title/description.
eventSchema.index({ title: 'text', description: 'text' });
// Public/admin list filters.
eventSchema.index({ status: 1, createdAt: -1 });
eventSchema.index({ status: 1, startTime: 1 });
eventSchema.index({ 'themeSnapshot.region': 1, status: 1 });
eventSchema.index({ organizer: 1, createdAt: -1 });
// Tenant-scoped + chronological hot paths (additive; no document changes).
eventSchema.index({ createdBy: 1, createdAt: -1 });
eventSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ isLive: 1, status: 1 });

/**
 * Generates a unique short code for an event: an initials prefix plus a random
 * segment (widening on repeated collisions). Kept in Mongo for lookup + embed.
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

/**
 * Unique public slug for NEW events (ravi-priya-wedding). Existing documents
 * keep their stored slug so production /AM5DJS and /bride-weds-groom stay put.
 */
eventSchema.statics.generateUniquePublicSlug = async function generateUniquePublicSlug(doc) {
  const live = buildLivePageSlug(doc);
  const couple = buildCoupleWatchSlug(doc);
  const titleSlug = slugifyName(doc.title) || 'event';
  let base = live || couple || titleSlug || 'event';
  if (RESERVED_PUBLIC_ROOTS.has(base)) base = `${base}-live`;

  const taken = async (candidate) =>
    this.exists({
      _id: { $ne: doc._id },
      $or: [{ slug: candidate }, { shortCode: candidate.toUpperCase() }],
    });

  let candidate = base;
  if (!(await taken(candidate))) return candidate;
  for (let n = 2; n <= 50; n += 1) {
    candidate = `${base}-${n}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${randomSegment(4).toLowerCase()}`;
};

// Assign a unique slug and a stable short code before validation.
// Do not rewrite slug on later title edits — that would change public URLs.
eventSchema.pre('validate', async function ensureSlugAndShortCode() {
  if (!this.slug) {
    this.slug = await this.constructor.generateUniquePublicSlug(this);
  }
  // New documents get /live/{slug}. Never rewrite style on later edits.
  if (this.isNew && !this.publicUrlStyle) {
    this.publicUrlStyle = 'live';
  }

  if (!this.shortCode) {
    this.shortCode = await this.constructor.generateUniqueShortCode(this);
  }
});

// Premium Server Live: persist RTMP URL, stream key, and playback URL from event id.
eventSchema.pre('save', function ensureServerStreamFields() {
  if (this.streamProvider !== 'rtmp') return;
  syncServerStreamFields(this);
});

// Keep YouTube fields in sync when only streamUrl was saved.
// Manual URL / youtubeVideoId always win over a generated broadcast id.
eventSchema.pre('save', function syncYoutubeFromStreamUrl() {
  const fromVideoId = extractYouTubeId(this.youtubeVideoId);
  const fromUrls =
    extractYouTubeId(this.youtubeWatchUrl) ||
    extractYouTubeId(this.streamUrl) ||
    '';
  const fromBroadcast = extractYouTubeId(this.youtubeBroadcastId);
  // Manual / existing youtubeVideoId must never be replaced by youtubeBroadcastId.
  const id = fromVideoId || fromUrls || fromBroadcast || '';
  if (!id) return;
  this.youtubeVideoId = id;
  if (fromVideoId || fromUrls) {
    const preserved = fromVideoId || fromUrls;
    this.youtubeBroadcastId = preserved;
    const watch =
      (extractYouTubeId(this.youtubeWatchUrl) === preserved && this.youtubeWatchUrl) ||
      (extractYouTubeId(this.streamUrl) === preserved && this.streamUrl) ||
      `https://www.youtube.com/watch?v=${preserved}`;
    this.youtubeWatchUrl = watch;
    if (!extractYouTubeId(this.streamUrl) || extractYouTubeId(this.streamUrl) !== preserved) {
      this.streamUrl = watch;
    }
  }
  if (!this.streamProvider || this.streamProvider === 'none') {
    this.streamProvider = 'youtube';
  }
});

eventSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    // Never leak ingest secrets in JSON responses.
    delete ret.rtmpStreamKey;
    delete ret.youtubeStreamKey;
    delete ret.facebookStreamKey;
    return ret;
  },
});

export const Event = model('Event', eventSchema);
