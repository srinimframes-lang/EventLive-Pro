import { Theme } from '../models/Theme.js';

/* eslint-disable no-console */

function img(id) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=75`;
}

/**
 * 10 premium wedding layout themes + 2 reception themes.
 * Upserted on deploy; all other catalog themes are removed.
 */
export const CURATED_THEMES = [
  {
    name: 'Royal Palace',
    slug: 'premium-royal-palace',
    category: 'wedding',
    layoutVariant: 'royal-palace',
    description: 'Dark maroon and antique gold with palace grandeur, crown motifs, and royal serif typography.',
    backgroundImage: img('1519741497674-05eec4c9a3e0'),
    colors: { primary: '#5c0a0a', secondary: '#3f0a0a', accent: '#c9a227', heroText: '#fff8e7', surface: '#1a0a0a', footerBg: '#2d0a0a', footerText: '#f5e6c8' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Cormorant Garamond", Georgia, serif' },
    style: { decoration: 'royal-crown', buttonStyle: 'rounded-gold', iconSet: 'crown', particleStyle: 'gold-dust', gradientFrom: '#5c0a0a', gradientTo: '#c9a227', goldBorder: true, loadingAnimation: 'gold-shimmer' },
    heroLabel: 'Royal Celebration',
    footerText: 'With royal blessings',
    sortOrder: 1,
  },
  {
    name: 'Luxury Gold',
    slug: 'premium-luxury-gold',
    category: 'wedding',
    layoutVariant: 'luxury-gold',
    description: 'Black and gold luxury with glass cards, golden particles, and cinematic elegance.',
    backgroundImage: img('1470225620782-24cfdcd21e71'),
    colors: { primary: '#b8860b', secondary: '#1a1a1a', accent: '#f5d78e', heroText: '#fffbeb', surface: '#0a0a0a', footerBg: '#000000', footerText: '#f5d78e' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Montserrat", system-ui, sans-serif' },
    style: { decoration: 'luxury', buttonStyle: 'pill-glow', iconSet: 'diamond', particleStyle: 'gold-dust', gradientFrom: '#1a1a1a', gradientTo: '#b8860b', goldBorder: false, loadingAnimation: 'gold-shimmer' },
    heroLabel: 'Luxury Live',
    footerText: 'Golden moments forever',
    sortOrder: 2,
  },
  {
    name: 'Floral Garden',
    slug: 'premium-floral-garden',
    category: 'wedding',
    layoutVariant: 'floral-garden',
    description: 'White and blush pink with fresh florals, soft shadows, and romantic script fonts.',
    backgroundImage: img('1465496919957-b1cf01e17bb7'),
    colors: { primary: '#db2777', secondary: '#fce7f3', accent: '#fbcfe8', heroText: '#831843', surface: '#fff5f7', footerBg: '#fdf2f8', footerText: '#9d174d' },
    fonts: { heading: '"Dancing Script", cursive', body: '"Lora", Georgia, serif' },
    style: { decoration: 'floral', buttonStyle: 'glass', iconSet: 'flower', particleStyle: 'petals', gradientFrom: '#fce7f3', gradientTo: '#fbcfe8', goldBorder: false, loadingAnimation: 'floral-pulse' },
    heroLabel: 'Garden Wedding',
    footerText: 'Love in full bloom',
    sortOrder: 3,
  },
  {
    name: 'South Indian Traditional',
    slug: 'premium-south-indian',
    category: 'wedding',
    region: 'tamil_nadu',
    layoutVariant: 'south-indian-traditional',
    description: 'Temple backdrop with mango leaves, brass lamps, red and gold traditional borders.',
    backgroundImage: img('1605647543714-5c303122aec9'),
    colors: { primary: '#b91c1c', secondary: '#7f1d1d', accent: '#f59e0b', heroText: '#ffffff', surface: '#fff7ed', footerBg: '#450a0a', footerText: '#fef3c7' },
    fonts: { heading: '"Merriweather", Georgia, serif', body: '"Source Sans 3", system-ui, sans-serif' },
    style: { decoration: 'temple', buttonStyle: 'rounded-gold', iconSet: 'lotus', particleStyle: 'gold-dust', gradientFrom: '#b91c1c', gradientTo: '#f59e0b', goldBorder: true, loadingAnimation: 'temple-glow' },
    heroLabel: 'Traditional Wedding',
    footerText: 'సంప్రదాయం · Blessings',
    sortOrder: 4,
  },
  {
    name: 'Modern Minimal',
    slug: 'premium-modern-minimal',
    category: 'wedding',
    layoutVariant: 'modern-minimal',
    description: 'Clean white canvas, bold typography, black and gold accents, large imagery.',
    backgroundImage: img('1511285560929-80b456e0d9a0'),
    colors: { primary: '#0f0f0f', secondary: '#525252', accent: '#c9a227', heroText: '#0f0f0f', surface: '#ffffff', footerBg: '#0f0f0f', footerText: '#fafafa' },
    fonts: { heading: '"Inter", system-ui, sans-serif', body: '"Inter", system-ui, sans-serif' },
    style: { decoration: 'minimal', buttonStyle: 'sharp', iconSet: 'rings', particleStyle: 'none', gradientFrom: '#ffffff', gradientTo: '#f5f5f5', goldBorder: false, loadingAnimation: 'wave' },
    heroLabel: 'Wedding Live',
    footerText: 'Simply elegant',
    sortOrder: 5,
  },
  {
    name: 'Sunset Romance',
    slug: 'premium-sunset-romance',
    category: 'wedding',
    layoutVariant: 'sunset-romance',
    description: 'Orange and peach gradients with warm sunset lighting and romantic curves.',
    backgroundImage: img('1522673550889-84d44c25de38'),
    colors: { primary: '#ea580c', secondary: '#fb923c', accent: '#fed7aa', heroText: '#ffffff', surface: '#fff7ed', footerBg: '#7c2d12', footerText: '#ffedd5' },
    fonts: { heading: '"Playfair Display", Georgia, serif', body: '"Nunito", system-ui, sans-serif' },
    style: { decoration: 'romantic', buttonStyle: 'pill-glow', iconSet: 'heart', particleStyle: 'bokeh', gradientFrom: '#ea580c', gradientTo: '#fb923c', goldBorder: false, loadingAnimation: 'floral-pulse' },
    heroLabel: 'Sunset Ceremony',
    footerText: 'Warmly yours',
    sortOrder: 6,
  },
  {
    name: 'Emerald Wedding',
    slug: 'premium-emerald-wedding',
    category: 'wedding',
    layoutVariant: 'emerald-wedding',
    description: 'Emerald green with white florals, gold accents, luxury invitation styling.',
    backgroundImage: img('1519225421980-715cb0215aed'),
    colors: { primary: '#047857', secondary: '#065f46', accent: '#d4af37', heroText: '#ffffff', surface: '#ecfdf5', footerBg: '#064e3b', footerText: '#d1fae5' },
    fonts: { heading: '"Cormorant Garamond", Georgia, serif', body: '"Lora", Georgia, serif' },
    style: { decoration: 'invitation', buttonStyle: 'rounded-gold', iconSet: 'leaf', particleStyle: 'leaves', gradientFrom: '#047857', gradientTo: '#d4af37', goldBorder: true, loadingAnimation: 'lotus-spin' },
    heroLabel: 'Emerald Celebration',
    footerText: 'With love & grace',
    sortOrder: 7,
  },
  {
    name: 'Vintage Classic',
    slug: 'premium-vintage-classic',
    category: 'wedding',
    layoutVariant: 'vintage-classic',
    description: 'Beige paper texture, vintage borders, elegant serif fonts, antique palette.',
    backgroundImage: img('1583417224552-c6b5d7c4d5b0'),
    colors: { primary: '#78350f', secondary: '#a16207', accent: '#d6d3d1', heroText: '#292524', surface: '#faf5f0', footerBg: '#44403c', footerText: '#e7e5e4' },
    fonts: { heading: '"Libre Baskerville", Georgia, serif', body: '"Libre Baskerville", Georgia, serif' },
    style: { decoration: 'vintage', buttonStyle: 'outline-glass', iconSet: 'rings', particleStyle: 'dust', gradientFrom: '#faf5f0', gradientTo: '#e7e5e4', goldBorder: false, loadingAnimation: 'gold-shimmer' },
    heroLabel: 'Classic Wedding',
    footerText: 'Timeless romance',
    sortOrder: 8,
  },
  {
    name: 'Crystal Wedding',
    slug: 'premium-crystal-wedding',
    category: 'wedding',
    layoutVariant: 'crystal-wedding',
    description: 'White and silver crystal shine with glassmorphism and modern luxury cards.',
    backgroundImage: img('1519167758481-83f550bb49b3'),
    colors: { primary: '#64748b', secondary: '#94a3b8', accent: '#e2e8f0', heroText: '#0f172a', surface: '#f8fafc', footerBg: '#1e293b', footerText: '#f1f5f9' },
    fonts: { heading: '"Montserrat", system-ui, sans-serif', body: '"Montserrat", system-ui, sans-serif' },
    style: { decoration: 'crystal', buttonStyle: 'glass', iconSet: 'diamond', particleStyle: 'bubbles', gradientFrom: '#f8fafc', gradientTo: '#e2e8f0', goldBorder: false, loadingAnimation: 'wave' },
    heroLabel: 'Crystal Celebration',
    footerText: 'Pure & radiant',
    sortOrder: 9,
  },
  {
    name: 'Night Sky Wedding',
    slug: 'premium-night-sky',
    category: 'wedding',
    layoutVariant: 'night-sky-wedding',
    description: 'Deep blue night sky with stars, moonlight glow, and elegant gold typography.',
    backgroundImage: img('1419242907884-86e9436fab2c'),
    colors: { primary: '#1e3a8a', secondary: '#0f172a', accent: '#fbbf24', heroText: '#fef3c7', surface: '#0f172a', footerBg: '#020617', footerText: '#fde68a' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Lora", Georgia, serif' },
    style: { decoration: 'night-sky', buttonStyle: 'pill-glow', iconSet: 'star', particleStyle: 'stars', gradientFrom: '#0f172a', gradientTo: '#1e3a8a', goldBorder: false, loadingAnimation: 'gold-shimmer' },
    heroLabel: 'Under the Stars',
    footerText: 'Written in the stars',
    sortOrder: 10,
  },
  {
    name: 'Royal Reception Night',
    slug: 'premium-reception-royal-night',
    category: 'reception',
    layoutVariant: 'reception-royal-night',
    description: 'Black and gold luxury reception with stage spotlights, golden borders, and floating gold particles.',
    backgroundImage: img('1541535658318-c050d485dfb5'),
    colors: { primary: '#0a0a0a', secondary: '#1a1a1a', accent: '#d4af37', heroText: '#fff8e7', surface: '#0f0f0f', footerBg: '#000000', footerText: '#d4af37' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Cormorant Garamond", Georgia, serif' },
    style: { decoration: 'luxury', buttonStyle: 'pill-glow', iconSet: 'champagne', particleStyle: 'gold-dust', gradientFrom: '#0a0a0a', gradientTo: '#d4af37', goldBorder: true, loadingAnimation: 'gold-shimmer' },
    heroLabel: 'Royal Reception',
    footerText: 'An evening of elegance',
    sortOrder: 11,
  },
  {
    name: 'Crystal Reception',
    slug: 'premium-reception-crystal',
    category: 'reception',
    layoutVariant: 'reception-crystal',
    description: 'White, silver and royal blue glassmorphism with crystal sparkles, full-width hero banner, and prism gallery.',
    backgroundImage: img('1464366405410-ae42a5586081'),
    colors: { primary: '#1e3a8a', secondary: '#64748b', accent: '#e2e8f0', heroText: '#ffffff', surface: '#f8fafc', footerBg: '#1e3a8a', footerText: '#f1f5f9' },
    fonts: { heading: '"Playfair Display", Georgia, serif', body: '"Raleway", system-ui, sans-serif' },
    style: { decoration: 'crystal', buttonStyle: 'glass', iconSet: 'diamond', particleStyle: 'crystal-sparkle', gradientFrom: '#1e3a8a', gradientTo: '#e2e8f0', goldBorder: false, loadingAnimation: 'wave' },
    heroLabel: 'Crystal Reception',
    footerText: 'Shimmering celebrations',
    sortOrder: 12,
  },
];

export async function seedCuratedThemes() {
  const slugs = CURATED_THEMES.map((t) => t.slug);

  for (const doc of CURATED_THEMES) {
    // eslint-disable-next-line no-await-in-loop
    await Theme.findOneAndUpdate(
      { slug: doc.slug },
      { $set: { ...doc, isPremium: true, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const { deletedCount } = await Theme.deleteMany({ slug: { $nin: slugs } });
  if (deletedCount) {
    console.log(`[seed] Removed ${deletedCount} legacy theme(s); ${slugs.length} premium layout themes active.`);
  } else {
    console.log(`[seed] Premium layout themes ready (${slugs.length} templates).`);
  }
}
