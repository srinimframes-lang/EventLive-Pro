import { Theme, THEME_CATEGORIES } from '../models/Theme.js';

/* eslint-disable no-console */

const HEADING_FONTS = [
  '"Playfair Display", Georgia, serif',
  '"Cormorant Garamond", Georgia, serif',
  '"Cinzel", Georgia, serif',
  '"Dancing Script", cursive',
  '"Lora", Georgia, serif',
  '"Merriweather", Georgia, serif',
  '"Montserrat", system-ui, sans-serif',
  '"Raleway", system-ui, sans-serif',
];

const BODY_FONTS = [
  'Inter, system-ui, sans-serif',
  '"Source Sans 3", system-ui, sans-serif',
  '"Nunito", system-ui, sans-serif',
  '"Open Sans", system-ui, sans-serif',
  '"Lato", system-ui, sans-serif',
  '"Poppins", system-ui, sans-serif',
  '"Roboto", system-ui, sans-serif',
  '"Work Sans", system-ui, sans-serif',
];

const PALETTES = [
  { primary: '#be185d', secondary: '#9d174d', accent: '#f472b6', surface: '#fdf2f8', footerBg: '#500724' },
  { primary: '#b45309', secondary: '#92400e', accent: '#fbbf24', surface: '#fffbeb', footerBg: '#451a03' },
  { primary: '#1d4ed8', secondary: '#1e3a8a', accent: '#60a5fa', surface: '#eff6ff', footerBg: '#172554' },
  { primary: '#047857', secondary: '#065f46', accent: '#34d399', surface: '#ecfdf5', footerBg: '#064e3b' },
  { primary: '#7c3aed', secondary: '#5b21b6', accent: '#a78bfa', surface: '#f5f3ff', footerBg: '#2e1065' },
  { primary: '#0f766e', secondary: '#115e59', accent: '#2dd4bf', surface: '#f0fdfa', footerBg: '#134e4a' },
  { primary: '#c2410c', secondary: '#9a3412', accent: '#fb923c', surface: '#fff7ed', footerBg: '#431407' },
  { primary: '#4338ca', secondary: '#3730a3', accent: '#818cf8', surface: '#eef2ff', footerBg: '#1e1b4b' },
];

const CATEGORY_HERO_LABELS = {
  wedding: 'Wedding Live',
  reception: 'Reception Live',
  engagement: 'Engagement Live',
  haldi: 'Haldi Ceremony',
  mehendi: 'Mehendi Live',
  sangeet: 'Sangeet Night',
  birthday: 'Birthday Live',
  baby_shower: 'Baby Shower Live',
  house_warming: 'House Warming Live',
  corporate: 'Corporate Live',
  temple: 'Temple Event Live',
  memorial: 'Memorial Service',
};

const CATEGORY_BG_IDS = {
  wedding: ['1519741497674', '1464366400600', '1522673550889', '1511285560929', '1465496919957', '1519225429268', '1520854221256', '1515934757279'],
  reception: ['1470225620782', '1511795409834', '1469371670777', '1523438097201', '1519167758481', '1519225429268', '1464366400600', '1519741497674'],
  engagement: ['1515934757279', '1522673550889', '1465496919957', '1511285560929', '1520854221256', '1519741497674', '1464366400600', '1511795409834'],
  haldi: ['1606800053565', '1583939003579', '1591604466109', '1606800053565', '1583939003579', '1591604466109', '1606800053565', '1583939003579'],
  mehendi: ['1515934757279', '1522673550889', '1465496919957', '1511285560929', '1520854221256', '1519741497674', '1464366400600', '1511795409834'],
  sangeet: ['1470225620782', '1519167758481', '1523438097201', '1469371670777', '1511795409834', '1519225429268', '1464366400600', '1519741497674'],
  birthday: ['1530103862677', '1464347751481', '1504196606672', '1558636508', '1511795409834', '1469371670777', '1523438097201', '1519167758481'],
  baby_shower: ['1555251364', '1515488764272', '1544369637', '1515488764272', '1555251364', '1544369637', '1515488764272', '1555251364'],
  house_warming: ['1560448204', '1564013799919', '1582268611958', '1560448204', '1564013799919', '1582268611958', '1560448204', '1564013799919'],
  corporate: ['1542744173', '1556761175', '1552664730', '1556761175', '1542744173', '1552664730', '1556761175', '1542744173'],
  temple: ['1583417224552', '1605647543714', '1605647543714', '1583417224552', '1605647543714', '1583417224552', '1605647543714', '1583417224552'],
  memorial: ['1478145041197', '1507003211169', '1497366216543', '1478145041197', '1507003211169', '1497366216543', '1478145041197', '1507003211169'],
};

const TEMPLATE_NAMES = [
  'Royal Elegance',
  'Golden Heritage',
  'Modern Minimal',
  'Floral Bliss',
  'Classic Ivory',
  'Midnight Luxe',
  'Sunset Romance',
  'Pearl Premium',
];

function bgUrl(category, index) {
  const ids = CATEGORY_BG_IDS[category] || CATEGORY_BG_IDS.wedding;
  const id = ids[index % ids.length];
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1920&q=80`;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function seedDefaultThemes() {
  const count = await Theme.countDocuments();
  const target = THEME_CATEGORIES.length * 8;

  const docs = buildThemeDocs();

  if (count >= target) {
    // Catalog already seeded — refresh palette/fonts/backgrounds on every deploy
    // so category-specific colors stay distinct without duplicating rows.
    let updated = 0;
    for (const doc of docs) {
      const existing = await Theme.findOne({ slug: doc.slug });
      if (!existing) continue;
      existing.colors = doc.colors;
      existing.fonts = doc.fonts;
      existing.backgroundImage = doc.backgroundImage;
      existing.heroLabel = doc.heroLabel;
      existing.description = doc.description;
      await existing.save();
      updated += 1;
    }
    console.log(`[seed] Themes refreshed: ${updated} of ${count}.`);
    return;
  }

  // First-time seed.
  let created = 0;
  for (const doc of docs) {
    const existing = await Theme.findOne({ slug: doc.slug });
    if (!existing) {
      await Theme.create(doc);
      created += 1;
    }
  }
  console.log(`[seed] Themes: ${created} created, ${await Theme.countDocuments()} total.`);
}

function buildThemeDocs() {
  const docs = [];
  for (const category of THEME_CATEGORIES) {
    const catIdx = THEME_CATEGORIES.indexOf(category);
    for (let i = 0; i < 8; i += 1) {
      const name = `${TEMPLATE_NAMES[i]} — ${category.replace(/_/g, ' ')}`;
      const palette = PALETTES[(i + catIdx) % PALETTES.length];
      docs.push({
        name,
        slug: slugify(`${category}-${TEMPLATE_NAMES[i]}-${i}`),
        category,
        description: `Premium ${category.replace(/_/g, ' ')} theme with ${TEMPLATE_NAMES[i]} styling.`,
        backgroundImage: bgUrl(category, i),
        colors: {
          ...palette,
          heroText: '#ffffff',
          footerText: '#f8fafc',
        },
        fonts: {
          heading: HEADING_FONTS[i],
          body: BODY_FONTS[i],
        },
        heroLabel: CATEGORY_HERO_LABELS[category],
        footerText: `© ${new Date().getFullYear()} · ${TEMPLATE_NAMES[i]}`,
        isPremium: true,
        isActive: true,
        sortOrder: i + 1,
      });
    }
  }
  return docs;
}
