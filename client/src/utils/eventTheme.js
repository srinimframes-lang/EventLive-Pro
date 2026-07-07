/** Labels for theme categories (mirrors server THEME_CATEGORY_LABELS). */
export const THEME_CATEGORY_LABELS = {
  wedding: 'Wedding',
  reception: 'Reception',
  engagement: 'Engagement',
  haldi: 'Haldi',
  mehendi: 'Mehendi',
  sangeet: 'Sangeet',
  birthday: 'Birthday',
  baby_shower: 'Baby Shower',
  house_warming: 'House Warming',
  corporate: 'Corporate Event',
  temple: 'Temple Event',
  memorial: 'Funeral / Memorial',
};

export const THEME_CATEGORIES = Object.keys(THEME_CATEGORY_LABELS);

/** True when the event has a frozen theme snapshot to render. */
export function hasEventTheme(event) {
  if (!event) return false;
  if (event.theme) return true;
  const snap = event.themeSnapshot;
  if (!snap || typeof snap !== 'object') return false;
  return Boolean(
    snap.name ||
      snap.category ||
      snap.backgroundImage ||
      snap.colors?.primary ||
      snap.heroLabel
  );
}

/** Normalize API payload so themeSnapshot is always a plain object. */
export function normalizeEventTheme(event) {
  if (!event) return event;
  const snap = event.themeSnapshot;
  if (snap && typeof snap === 'object') {
    event.themeSnapshot = {
      name: snap.name || '',
      category: snap.category || '',
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
    };
  }
  return event;
}

/** Build scoped CSS variables + font families for a theme snapshot. */
export function themeStyleVars(snapshot) {
  if (!snapshot) return {};
  const c = snapshot.colors || {};
  const f = snapshot.fonts || {};
  // Use snapshot values only — no hardcoded brand fallbacks in themed mode.
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
  };
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
