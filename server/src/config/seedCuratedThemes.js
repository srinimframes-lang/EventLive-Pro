import { Theme } from '../models/Theme.js';

/* eslint-disable no-console */

/** Optimized Unsplash background — WebP when supported, 1600px wide. */
function img(id) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=75`;
}

/**
 * 20 curated themes — quality over quantity.
 * Upserted on every deploy; all other catalog themes are removed.
 */
export const CURATED_THEMES = [
  // ── Wedding (5) ─────────────────────────────────────────────
  {
    name: 'Royal Wedding',
    slug: 'curated-royal-wedding',
    category: 'wedding',
    description: 'Regal burgundy and gold for grand wedding celebrations.',
    backgroundImage: img('1519741497674-05eec4c9a3e0'),
    colors: { primary: '#7f1d1d', secondary: '#991b1b', accent: '#fbbf24', heroText: '#ffffff', surface: '#fef2f2', footerBg: '#450a0a', footerText: '#fef3c7' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Cormorant Garamond", Georgia, serif' },
    style: { decoration: 'gold-ornate', buttonStyle: 'pill-glow', iconSet: 'crown', particleStyle: 'gold-dust', gradientFrom: '#7f1d1d', gradientTo: '#fbbf24' },
    heroLabel: 'Royal Wedding Live',
    footerText: 'With love & grandeur',
    sortOrder: 1,
  },
  {
    name: 'Floral Wedding',
    slug: 'curated-floral-wedding',
    category: 'wedding',
    description: 'Soft blush florals and romantic script typography.',
    backgroundImage: img('1465496919957-b1cf01e17bb7'),
    colors: { primary: '#db2777', secondary: '#be185d', accent: '#fbcfe8', heroText: '#ffffff', surface: '#fdf2f8', footerBg: '#831843', footerText: '#fce7f3' },
    fonts: { heading: '"Dancing Script", cursive', body: '"Lora", Georgia, serif' },
    style: { decoration: 'floral', buttonStyle: 'glass', iconSet: 'flower', particleStyle: 'petals', gradientFrom: '#db2777', gradientTo: '#fbcfe8' },
    heroLabel: 'Floral Celebration',
    footerText: 'Blooming with love',
    sortOrder: 2,
  },
  {
    name: 'Traditional Telugu Wedding',
    slug: 'curated-telugu-wedding',
    category: 'wedding',
    description: 'Vibrant maroon and temple gold inspired by South Indian traditions.',
    backgroundImage: img('1605647543714-5c303122aec9'),
    colors: { primary: '#b91c1c', secondary: '#7f1d1d', accent: '#f59e0b', heroText: '#ffffff', surface: '#fef2f2', footerBg: '#450a0a', footerText: '#fef3c7' },
    fonts: { heading: '"Merriweather", Georgia, serif', body: '"Source Sans 3", system-ui, sans-serif' },
    style: { decoration: 'mandala', buttonStyle: 'rounded-gold', iconSet: 'lotus', particleStyle: 'gold-dust', gradientFrom: '#b91c1c', gradientTo: '#f59e0b', goldBorder: true },
    heroLabel: 'Telugu Wedding Live',
    footerText: 'సంప్రదాయం · Tradition',
    sortOrder: 3,
  },
  {
    name: 'Luxury Gold',
    slug: 'curated-luxury-gold',
    category: 'wedding',
    description: 'Opulent champagne gold on deep charcoal for a luxe affair.',
    backgroundImage: img('1470225620782-24cfdcd21e71'),
    colors: { primary: '#b45309', secondary: '#92400e', accent: '#fde68a', heroText: '#fffbeb', surface: '#fffbeb', footerBg: '#1c1917', footerText: '#fde68a' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Playfair Display", Georgia, serif' },
    style: { decoration: 'gold-ornate', buttonStyle: 'pill-glow', iconSet: 'diamond', particleStyle: 'gold-dust', gradientFrom: '#b45309', gradientTo: '#1c1917' },
    heroLabel: 'Luxury Gold Live',
    footerText: 'Golden moments',
    sortOrder: 4,
  },
  {
    name: 'Garden Wedding',
    slug: 'curated-garden-wedding',
    category: 'wedding',
    description: 'Fresh greenery and natural light for an outdoor garden ceremony.',
    backgroundImage: img('1519225421980-715cb0215aed'),
    colors: { primary: '#166534', secondary: '#14532d', accent: '#86efac', heroText: '#ffffff', surface: '#f0fdf4', footerBg: '#052e16', footerText: '#bbf7d0' },
    fonts: { heading: '"Playfair Display", Georgia, serif', body: '"Lora", Georgia, serif' },
    style: { decoration: 'floral', buttonStyle: 'glass', iconSet: 'leaf', particleStyle: 'leaves', gradientFrom: '#166534', gradientTo: '#86efac' },
    heroLabel: 'Garden Wedding Live',
    footerText: 'Love in bloom',
    sortOrder: 5,
  },

  // ── Reception (5) ───────────────────────────────────────────
  {
    name: 'Reception Royal',
    slug: 'curated-reception-royal',
    category: 'reception',
    description: 'Purple velvet and golden chandeliers for a royal reception.',
    backgroundImage: img('1519167758481-83f550bb49b3'),
    colors: { primary: '#6b21a8', secondary: '#581c87', accent: '#fbbf24', heroText: '#ffffff', surface: '#faf5ff', footerBg: '#3b0764', footerText: '#e9d5ff' },
    fonts: { heading: '"Playfair Display", Georgia, serif', body: '"Raleway", system-ui, sans-serif' },
    style: { decoration: 'gold-ornate', buttonStyle: 'pill-glow', iconSet: 'champagne', particleStyle: 'bokeh', gradientFrom: '#6b21a8', gradientTo: '#fbbf24' },
    heroLabel: 'Royal Reception',
    footerText: 'Celebrate in style',
    sortOrder: 10,
  },
  {
    name: 'Evening Gala',
    slug: 'curated-reception-gala',
    category: 'reception',
    description: 'Elegant midnight blues with silver accents for an evening gala.',
    backgroundImage: img('1478145047276-4a3b5c6abcff'),
    colors: { primary: '#1e3a8a', secondary: '#1e40af', accent: '#93c5fd', heroText: '#ffffff', surface: '#eff6ff', footerBg: '#0f172a', footerText: '#bfdbfe' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Raleway", system-ui, sans-serif' },
    style: { decoration: 'elegant', buttonStyle: 'glass', iconSet: 'champagne', particleStyle: 'stars', gradientFrom: '#1e3a8a', gradientTo: '#93c5fd' },
    heroLabel: 'Evening Gala Live',
    footerText: 'An evening to remember',
    sortOrder: 11,
  },
  {
    name: 'Golden Reception',
    slug: 'curated-reception-golden',
    category: 'reception',
    description: 'Warm amber candlelight and gold table settings.',
    backgroundImage: img('1464366400600-5662667560ae'),
    colors: { primary: '#b45309', secondary: '#92400e', accent: '#fde68a', heroText: '#ffffff', surface: '#fffbeb', footerBg: '#451a03', footerText: '#fef3c7' },
    fonts: { heading: '"Playfair Display", Georgia, serif', body: '"Cormorant Garamond", Georgia, serif' },
    style: { decoration: 'gold-ornate', buttonStyle: 'rounded-gold', iconSet: 'champagne', particleStyle: 'gold-dust', gradientFrom: '#b45309', gradientTo: '#fde68a' },
    heroLabel: 'Golden Reception Live',
    footerText: 'Cheers to love',
    sortOrder: 12,
  },
  {
    name: 'Classic White Reception',
    slug: 'curated-reception-classic',
    category: 'reception',
    description: 'Timeless ivory and pearl tones for a classic reception.',
    backgroundImage: img('1511795409834-ef04bbd61622'),
    colors: { primary: '#64748b', secondary: '#475569', accent: '#f8fafc', heroText: '#ffffff', surface: '#f8fafc', footerBg: '#1e293b', footerText: '#e2e8f0' },
    fonts: { heading: '"Playfair Display", Georgia, serif', body: '"Inter", system-ui, sans-serif' },
    style: { decoration: 'elegant', buttonStyle: 'outline-glass', iconSet: 'rings', particleStyle: 'bokeh', gradientFrom: '#64748b', gradientTo: '#f8fafc' },
    heroLabel: 'Classic Reception Live',
    footerText: 'Elegance & grace',
    sortOrder: 13,
  },
  {
    name: 'Ruby Reception',
    slug: 'curated-reception-ruby',
    category: 'reception',
    description: 'Rich ruby red with rose-gold highlights for a bold reception.',
    backgroundImage: img('1522673603280-1d418cfbd9da'),
    colors: { primary: '#be123c', secondary: '#9f1239', accent: '#fda4af', heroText: '#ffffff', surface: '#fff1f2', footerBg: '#4c0519', footerText: '#fecdd3' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Lora", Georgia, serif' },
    style: { decoration: 'floral', buttonStyle: 'pill-glow', iconSet: 'flower', particleStyle: 'petals', gradientFrom: '#be123c', gradientTo: '#fda4af' },
    heroLabel: 'Ruby Reception Live',
    footerText: 'Forever begins tonight',
    sortOrder: 14,
  },

  // ── Sangeet (5) ─────────────────────────────────────────────
  {
    name: 'Sangeet Neon',
    slug: 'curated-sangeet-neon',
    category: 'sangeet',
    description: 'Electric neon lights and dance-floor energy for sangeet night.',
    backgroundImage: img('1514525253161-7a46e19d933a'),
    colors: { primary: '#d946ef', secondary: '#a21caf', accent: '#22d3ee', heroText: '#ffffff', surface: '#1e1b4b', footerBg: '#0f0a1a', footerText: '#e879f9' },
    fonts: { heading: '"Montserrat", system-ui, sans-serif', body: '"Poppins", system-ui, sans-serif' },
    style: { decoration: 'neon', buttonStyle: 'neon', iconSet: 'music', particleStyle: 'neon', gradientFrom: '#d946ef', gradientTo: '#22d3ee' },
    heroLabel: 'Sangeet Night Live',
    footerText: 'Dance · Sing · Celebrate',
    sortOrder: 20,
  },
  {
    name: 'Bollywood Sangeet',
    slug: 'curated-sangeet-bollywood',
    category: 'sangeet',
    description: 'Bollywood glamour with vibrant magenta and gold spotlights.',
    backgroundImage: img('1492684223066-81342ee5ff30'),
    colors: { primary: '#c026d3', secondary: '#a21caf', accent: '#fbbf24', heroText: '#ffffff', surface: '#fdf4ff', footerBg: '#581c87', footerText: '#f5d0fe' },
    fonts: { heading: '"Montserrat", system-ui, sans-serif', body: '"Poppins", system-ui, sans-serif' },
    style: { decoration: 'cinematic', buttonStyle: 'neon', iconSet: 'music', particleStyle: 'confetti', gradientFrom: '#c026d3', gradientTo: '#fbbf24' },
    heroLabel: 'Bollywood Sangeet Live',
    footerText: 'Lights, camera, celebration!',
    sortOrder: 21,
  },
  {
    name: 'Punjabi Sangeet',
    slug: 'curated-sangeet-punjabi',
    category: 'sangeet',
    description: 'Bold orange and green bhangra energy for Punjabi sangeet.',
    backgroundImage: img('1464366400600-5662667560ae'),
    colors: { primary: '#ea580c', secondary: '#c2410c', accent: '#4ade80', heroText: '#ffffff', surface: '#fff7ed', footerBg: '#431407', footerText: '#ffedd5' },
    fonts: { heading: '"Montserrat", system-ui, sans-serif', body: '"Roboto", system-ui, sans-serif' },
    style: { decoration: 'confetti', buttonStyle: 'pill-glow', iconSet: 'music', particleStyle: 'confetti', gradientFrom: '#ea580c', gradientTo: '#4ade80' },
    heroLabel: 'Punjabi Sangeet Live',
    footerText: 'Balle balle!',
    sortOrder: 22,
  },
  {
    name: 'Musical Sangeet',
    slug: 'curated-sangeet-musical',
    category: 'sangeet',
    description: 'Deep indigo stage lights with musical note accents.',
    backgroundImage: img('1514525253161-7a46e19d933a'),
    colors: { primary: '#4338ca', secondary: '#3730a3', accent: '#a5b4fc', heroText: '#ffffff', surface: '#eef2ff', footerBg: '#1e1b4b', footerText: '#c7d2fe' },
    fonts: { heading: '"Montserrat", system-ui, sans-serif', body: '"Poppins", system-ui, sans-serif' },
    style: { decoration: 'neon', buttonStyle: 'glass', iconSet: 'music', particleStyle: 'stars', gradientFrom: '#4338ca', gradientTo: '#a5b4fc' },
    heroLabel: 'Musical Sangeet Live',
    footerText: 'Let the music play',
    sortOrder: 23,
  },
  {
    name: 'Disco Sangeet',
    slug: 'curated-sangeet-disco',
    category: 'sangeet',
    description: 'Retro disco ball sparkle with pink and cyan dance-floor vibes.',
    backgroundImage: img('1478145047276-4a3b5c6abcff'),
    colors: { primary: '#ec4899', secondary: '#db2777', accent: '#06b6d4', heroText: '#ffffff', surface: '#fdf2f8', footerBg: '#500724', footerText: '#fbcfe8' },
    fonts: { heading: '"Montserrat", system-ui, sans-serif', body: '"Roboto", system-ui, sans-serif' },
    style: { decoration: 'neon', buttonStyle: 'neon', iconSet: 'music', particleStyle: 'neon', gradientFrom: '#ec4899', gradientTo: '#06b6d4' },
    heroLabel: 'Disco Sangeet Live',
    footerText: 'Dance all night',
    sortOrder: 24,
  },

  // ── Birthday (1) ────────────────────────────────────────────
  {
    name: 'Birthday Celebration',
    slug: 'curated-birthday-celebration',
    category: 'birthday',
    description: 'Playful rainbow colors and confetti for birthday parties.',
    backgroundImage: img('1530103862677-6be7f886aefc'),
    colors: { primary: '#2563eb', secondary: '#7c3aed', accent: '#f472b6', heroText: '#ffffff', surface: '#eff6ff', footerBg: '#1e3a8a', footerText: '#bfdbfe' },
    fonts: { heading: '"Nunito", system-ui, sans-serif', body: '"Poppins", system-ui, sans-serif' },
    style: { decoration: 'confetti', buttonStyle: 'pill-glow', iconSet: 'balloon', particleStyle: 'confetti', gradientFrom: '#2563eb', gradientTo: '#f472b6' },
    heroLabel: 'Birthday Party Live',
    footerText: "Let's party!",
    sortOrder: 30,
  },

  // ── Upanayanam (1) ──────────────────────────────────────────
  {
    name: 'Sacred Upanayanam',
    slug: 'curated-upanayanam-sacred',
    category: 'upanayanam',
    description: 'Saffron and temple gold for the sacred thread ceremony.',
    backgroundImage: img('1583417224552-c6b5d7c4d5b0'),
    colors: { primary: '#ea580c', secondary: '#c2410c', accent: '#fbbf24', heroText: '#ffffff', surface: '#fff7ed', footerBg: '#431407', footerText: '#ffedd5' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Lora", Georgia, serif' },
    style: { decoration: 'mandala', buttonStyle: 'rounded-gold', iconSet: 'temple', particleStyle: 'gold-dust', gradientFrom: '#ea580c', gradientTo: '#fbbf24', goldBorder: true },
    heroLabel: 'Upanayanam Live',
    footerText: 'Divine blessings',
    sortOrder: 40,
  },

  // ── Half Saree (3) ──────────────────────────────────────────
  {
    name: 'Half Saree — Gold',
    slug: 'curated-half-saree-gold',
    category: 'half_saree',
    description: 'Antique gold zari and maroon silk for the half saree ceremony.',
    backgroundImage: img('1519741497674-05eec4c9a3e0'),
    colors: { primary: '#92400e', secondary: '#78350f', accent: '#fde68a', heroText: '#ffffff', surface: '#fffbeb', footerBg: '#451a03', footerText: '#fef3c7' },
    fonts: { heading: '"Cinzel", Georgia, serif', body: '"Cormorant Garamond", Georgia, serif' },
    style: { decoration: 'gold-ornate', buttonStyle: 'rounded-gold', iconSet: 'lotus', particleStyle: 'gold-dust', gradientFrom: '#92400e', gradientTo: '#fde68a', goldBorder: true },
    heroLabel: 'Half Saree Live',
    footerText: 'A new chapter begins',
    sortOrder: 50,
  },
  {
    name: 'Half Saree — Floral',
    slug: 'curated-half-saree-floral',
    category: 'half_saree',
    description: 'Fresh jasmine and rose florals for the half saree celebration.',
    backgroundImage: img('1520854221256-17451cc791ee'),
    colors: { primary: '#be185d', secondary: '#9d174d', accent: '#fbcfe8', heroText: '#ffffff', surface: '#fdf2f8', footerBg: '#831843', footerText: '#fce7f3' },
    fonts: { heading: '"Dancing Script", cursive', body: '"Lora", Georgia, serif' },
    style: { decoration: 'floral', buttonStyle: 'glass', iconSet: 'flower', particleStyle: 'petals', gradientFrom: '#be185d', gradientTo: '#fbcfe8', goldBorder: true },
    heroLabel: 'Half Saree Live',
    footerText: 'Blooming into womanhood',
    sortOrder: 51,
  },
  {
    name: 'Half Saree — Traditional',
    slug: 'curated-half-saree-traditional',
    category: 'half_saree',
    description: 'Classic South Indian maroon and gold for the traditional ceremony.',
    backgroundImage: img('1605647543714-5c303122aec9'),
    colors: { primary: '#991b1b', secondary: '#7f1d1d', accent: '#fbbf24', heroText: '#ffffff', surface: '#fef2f2', footerBg: '#450a0a', footerText: '#fef3c7' },
    fonts: { heading: '"Merriweather", Georgia, serif', body: '"Source Sans 3", system-ui, sans-serif' },
    style: { decoration: 'mandala', buttonStyle: 'rounded-gold', iconSet: 'lotus', particleStyle: 'gold-dust', gradientFrom: '#991b1b', gradientTo: '#fbbf24', goldBorder: true },
    heroLabel: 'Half Saree Live',
    footerText: 'Tradition & grace',
    sortOrder: 52,
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
    console.log(`[seed] Removed ${deletedCount} legacy theme(s); ${slugs.length} curated themes active.`);
  } else {
    console.log(`[seed] Curated themes ready (${slugs.length} templates).`);
  }
}
