import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const THEME_CATEGORIES = [
  'wedding',
  'reception',
  'sangeet',
  'birthday',
  'upanayanam',
  'half_saree',
  'engagement',
  'haldi',
  'mehendi',
  'baby_shower',
  'house_warming',
  'corporate',
  'temple',
  'memorial',
];

export const THEME_REGIONS = ['telangana', 'andhra', 'tamil_nadu', 'kerala'];

export const THEME_LAYOUT_VARIANTS = [
  'royal-palace',
  'luxury-gold',
  'floral-garden',
  'south-indian-traditional',
  'modern-minimal',
  'sunset-romance',
  'emerald-wedding',
  'vintage-classic',
  'crystal-wedding',
  'night-sky-wedding',
  'reception-royal-night',
  'reception-crystal',
];

export const THEME_REGION_LABELS = {
  telangana: 'Telangana',
  andhra: 'Andhra Pradesh',
  tamil_nadu: 'Tamil Nadu',
  kerala: 'Kerala',
};

export const THEME_CATEGORY_LABELS = {
  wedding: 'Wedding',
  reception: 'Reception',
  sangeet: 'Sangeet',
  birthday: 'Birthday',
  upanayanam: 'Upanayanam',
  half_saree: 'Half Saree',
  engagement: 'Engagement',
  haldi: 'Haldi',
  mehendi: 'Mehendi',
  baby_shower: 'Baby Shower',
  house_warming: 'House Warming',
  corporate: 'Corporate Event',
  temple: 'Temple Event',
  memorial: 'Funeral / Memorial',
};

const colorSchema = new Schema(
  {
    primary: { type: String, default: '#be185d', trim: true },
    secondary: { type: String, default: '#9d174d', trim: true },
    accent: { type: String, default: '#f472b6', trim: true },
    heroText: { type: String, default: '#ffffff', trim: true },
    surface: { type: String, default: '#fdf2f8', trim: true },
    footerBg: { type: String, default: '#1e1b4b', trim: true },
    footerText: { type: String, default: '#f8fafc', trim: true },
  },
  { _id: false }
);

const fontSchema = new Schema(
  {
    heading: { type: String, default: '"Playfair Display", Georgia, serif', trim: true },
    body: { type: String, default: 'Inter, system-ui, sans-serif', trim: true },
  },
  { _id: false }
);

const styleSchema = new Schema(
  {
    decoration: { type: String, default: 'elegant', trim: true }, // floral, gold, neon, mandala, minimal, cinematic…
    buttonStyle: { type: String, default: 'pill-glow', trim: true }, // pill-glow, glass, sharp, neon, outline
    iconSet: { type: String, default: 'rings', trim: true },
    particleStyle: { type: String, default: 'bokeh', trim: true }, // petals, gold, neon, bubbles, stars, confetti, bokeh, none
    gradientFrom: { type: String, default: '', trim: true },
    gradientTo: { type: String, default: '', trim: true },
    goldBorder: { type: Boolean, default: false },
    loadingAnimation: { type: String, default: 'gold-shimmer', trim: true },
    backgroundMusic: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const themeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: {
      type: String,
      enum: THEME_CATEGORIES,
      required: true,
      index: true,
    },
    region: {
      type: String,
      enum: THEME_REGIONS,
      default: undefined,
      index: true,
    },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    backgroundImage: { type: String, default: '', trim: true },
    layoutVariant: {
      type: String,
      enum: THEME_LAYOUT_VARIANTS,
      default: 'royal-palace',
      index: true,
    },
    colors: { type: colorSchema, default: () => ({}) },
    fonts: { type: fontSchema, default: () => ({}) },
    style: { type: styleSchema, default: () => ({}) },
    heroLabel: { type: String, default: 'Live', trim: true, maxlength: 40 },
    footerText: { type: String, default: '', trim: true, maxlength: 200 },
    isPremium: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

themeSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

/** Plain snapshot for embedding on events (immune to later theme edits). */
themeSchema.methods.toSnapshot = function toSnapshot() {
  return {
    name: this.name,
    category: this.category,
    region: this.region || '',
    backgroundImage: this.backgroundImage,
    layoutVariant: this.layoutVariant || 'royal-palace',
    colors: { ...this.colors?.toObject?.() || this.colors },
    fonts: { ...this.fonts?.toObject?.() || this.fonts },
    style: { ...this.style?.toObject?.() || this.style },
    heroLabel: this.heroLabel,
    footerText: this.footerText,
    isPremium: this.isPremium,
  };
};

export const Theme = model('Theme', themeSchema);
