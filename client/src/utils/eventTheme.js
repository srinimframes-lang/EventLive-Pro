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
  return Boolean(event?.themeSnapshot?.colors?.primary || event?.themeSnapshot?.name);
}

/** Build scoped CSS variables + font families for a theme snapshot. */
export function themeStyleVars(snapshot) {
  if (!snapshot) return {};
  const c = snapshot.colors || {};
  const f = snapshot.fonts || {};
  return {
    '--theme-primary': c.primary || '#be185d',
    '--theme-secondary': c.secondary || '#9d174d',
    '--theme-accent': c.accent || '#f472b6',
    '--theme-hero-text': c.heroText || '#ffffff',
    '--theme-surface': c.surface || '#fdf2f8',
    '--theme-footer-bg': c.footerBg || '#1e1b4b',
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
