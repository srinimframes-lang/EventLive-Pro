/** Labels for theme categories (mirrors server THEME_CATEGORY_LABELS). */
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

export const THEME_CATEGORIES = Object.keys(THEME_CATEGORY_LABELS);

export const THEME_REGIONS = ['telangana', 'andhra', 'tamil_nadu', 'kerala'];

export const THEME_REGION_LABELS = {
  telangana: 'Telangana',
  andhra: 'Andhra Pradesh',
  tamil_nadu: 'Tamil Nadu',
  kerala: 'Kerala',
};

/** Default snapshot used when theme data is missing or corrupt. */
export const DEFAULT_THEME_SNAPSHOT = {
  name: 'Classic Live',
  category: 'wedding',
  region: '',
  backgroundImage: '',
  heroLabel: 'Live',
  footerText: '',
  isPremium: false,
  colors: {
    primary: '#be185d',
    secondary: '#9d174d',
    accent: '#f472b6',
    heroText: '#ffffff',
    surface: '#fdf2f8',
    footerBg: '#1e1b4b',
    footerText: '#f8fafc',
  },
  fonts: {
    heading: '"Playfair Display", Georgia, serif',
    body: 'Inter, system-ui, sans-serif',
  },
  style: {
    decoration: 'elegant',
    buttonStyle: 'pill-glow',
    iconSet: 'rings',
    particleStyle: 'bokeh',
    gradientFrom: '#be185d',
    gradientTo: '#f472b6',
    goldBorder: false,
    loadingAnimation: 'gold-shimmer',
    backgroundMusic: '',
  },
};

function isValidThemeSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return false;
  return Boolean(snap.name || snap.colors?.primary || snap.backgroundImage);
}

/** True when the event should use the themed watch layout. */
export function hasEventTheme(event) {
  if (!event) return false;
  if (event.theme) return true;
  return isValidThemeSnapshot(event.themeSnapshot);
}

/** Normalize API payload so themeSnapshot is always a plain object. */
export function normalizeEventTheme(event) {
  if (!event) return event;
  const snap = event.themeSnapshot;
  if (snap && typeof snap === 'object') {
    event.themeSnapshot = {
      name: snap.name || '',
      category: snap.category || '',
      region: snap.region || '',
      backgroundImage: snap.backgroundImage || '',
      heroLabel: snap.heroLabel || 'Live',
      footerText: snap.footerText || '',
      isPremium: Boolean(snap.isPremium),
      colors: {
        primary: snap.colors?.primary || '',
        secondary: snap.colors?.secondary || '',
        accent: snap.colors?.accent || '',
        heroText: snap.colors?.heroText || '#ffffff',
        surface: snap.colors?.surface || '',
        footerBg: snap.colors?.footerBg || '',
        footerText: snap.colors?.footerText || '#f8fafc',
      },
      fonts: {
        heading: snap.fonts?.heading || '"Playfair Display", Georgia, serif',
        body: snap.fonts?.body || 'Inter, system-ui, sans-serif',
      },
      style: {
        decoration: snap.style?.decoration || 'elegant',
        buttonStyle: snap.style?.buttonStyle || 'pill-glow',
        iconSet: snap.style?.iconSet || 'rings',
        particleStyle: snap.style?.particleStyle || 'bokeh',
        gradientFrom: snap.style?.gradientFrom || snap.colors?.primary || '',
        gradientTo: snap.style?.gradientTo || snap.colors?.accent || '',
        goldBorder: Boolean(snap.style?.goldBorder),
        loadingAnimation: snap.style?.loadingAnimation || 'gold-shimmer',
        backgroundMusic: snap.style?.backgroundMusic || '',
      },
    };
  }
  return event;
}

/**
 * Normalize theme data and guarantee a usable snapshot when a theme is selected.
 * Falls back to DEFAULT_THEME_SNAPSHOT if the snapshot is missing or invalid.
 */
export function ensureSafeEventTheme(event) {
  if (!event) return event;
  const normalized = normalizeEventTheme({ ...event });
  const wantsTheme = Boolean(normalized.theme);
  if (!wantsTheme) return normalized;

  if (!isValidThemeSnapshot(normalized.themeSnapshot)) {
    normalized.themeSnapshot = { ...DEFAULT_THEME_SNAPSHOT };
    normalized._themeFallback = true;
  }
  return normalized;
}

/** Build scoped CSS variables + font families for a theme snapshot. */
export function themeStyleVars(snapshot) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : DEFAULT_THEME_SNAPSHOT;
  try {
    const c = snap.colors || {};
    const f = snap.fonts || {};
    const s = snap.style || {};
    return {
      '--theme-primary': c.primary || '#6366f1',
      '--theme-secondary': c.secondary || c.primary || '#4f46e5',
      '--theme-accent': c.accent || c.primary || '#818cf8',
      '--theme-hero-text': c.heroText || '#ffffff',
      '--theme-surface': c.surface || '#f8fafc',
      '--theme-footer-bg': c.footerBg || '#0f172a',
      '--theme-footer-text': c.footerText || '#f8fafc',
      '--theme-font-heading': f.heading || '"Playfair Display", Georgia, serif',
      '--theme-font-body': f.body || 'Inter, system-ui, sans-serif',
      '--theme-gradient-from': s.gradientFrom || c.primary || '#6366f1',
      '--theme-gradient-to': s.gradientTo || c.accent || '#818cf8',
    };
  } catch {
    const d = DEFAULT_THEME_SNAPSHOT;
    const c = d.colors;
    const f = d.fonts;
    const s = d.style;
    return {
      '--theme-primary': c.primary,
      '--theme-secondary': c.secondary,
      '--theme-accent': c.accent,
      '--theme-hero-text': c.heroText,
      '--theme-surface': c.surface,
      '--theme-footer-bg': c.footerBg,
      '--theme-footer-text': c.footerText,
      '--theme-font-heading': f.heading,
      '--theme-font-body': f.body,
      '--theme-gradient-from': s.gradientFrom,
      '--theme-gradient-to': s.gradientTo,
    };
  }
}

/** Extract unique Google Font family names from CSS font stacks. */
export function googleFontFamilies(snapshot) {
  const stacks = [snapshot?.fonts?.heading, snapshot?.fonts?.body].filter(Boolean);
  const names = new Set();
  for (const stack of stacks) {
    const m = stack.match(/^"([^"]+)"/);
    if (m) names.add(m[1].replace(/ /g, '+'));
  }
  return [...names];
}

export function googleFontsHref(snapshot) {
  const families = googleFontFamilies(snapshot);
  if (!families.length) return '';
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}:wght@400;500;600;700;800`).join('&')}&display=swap`;
}
