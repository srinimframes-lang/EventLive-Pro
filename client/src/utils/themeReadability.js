/** WCAG-readable text colors for themed event pages. */
export const TEXT_ON_LIGHT = '#1A1A1A';
export const TEXT_ON_DARK = '#FFFFFF';

const HEX_RE = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const HEX_SHORT = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

/** Parse a hex color to [r, g, b] in 0–255. Returns null if unparseable. */
export function parseHex(color) {
  if (!color || typeof color !== 'string') return null;
  const raw = color.trim();
  let m = raw.match(HEX_RE);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  m = raw.match(HEX_SHORT);
  if (m) {
    return [
      parseInt(m[1] + m[1], 16),
      parseInt(m[2] + m[2], 16),
      parseInt(m[3] + m[3], 16),
    ];
  }
  return null;
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
export function relativeLuminance(color) {
  const rgb = parseHex(color);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True when the background is dark enough for white text. */
export function isDarkBackground(color) {
  return relativeLuminance(color) < 0.45;
}

/** Pick #1A1A1A on light backgrounds, #FFFFFF on dark. */
export function readableTextColor(backgroundColor) {
  return isDarkBackground(backgroundColor) ? TEXT_ON_DARK : TEXT_ON_LIGHT;
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(foreground, background) {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** @param {boolean} largeText - 3:1 for large/bold; 4.5:1 for normal */
export function meetsWcagAA(foreground, background, largeText = false) {
  return contrastRatio(foreground, background) >= (largeText ? 3 : 4.5);
}

function pickBestText(background, largeText = false) {
  const dark = TEXT_ON_LIGHT;
  const light = TEXT_ON_DARK;
  const darkOk = meetsWcagAA(dark, background, largeText);
  const lightOk = meetsWcagAA(light, background, largeText);
  if (darkOk && !lightOk) return dark;
  if (lightOk && !darkOk) return light;
  return readableTextColor(background);
}

/** Estimate hero overlay color from theme snapshot. */
export function estimateHeroBackground(snap, hasBgImage) {
  const footerBg = snap.colors?.footerBg;
  const gradientFrom = snap.style?.gradientFrom || snap.colors?.primary;
  if (hasBgImage) {
    return footerBg || gradientFrom || '#1a1a1a';
  }
  return gradientFrom || snap.colors?.secondary || snap.colors?.primary || '#4f46e5';
}

/** Readability tokens for the hero section (couple names, date, venue). */
export function getHeroReadability(snap, hasBgImage) {
  const background = estimateHeroBackground(snap, hasBgImage);
  const textColor = pickBestText(background, true);
  const isDark = textColor === TEXT_ON_DARK;
  const needsBackdrop =
    hasBgImage ||
    !meetsWcagAA(textColor, background, true);
  const mutedColor = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(26,26,26,0.82)';
  return { background, textColor, mutedColor, isDark, needsBackdrop };
}

/** Readability tokens for main content surface. */
export function getSurfaceReadability(snap) {
  const background = snap.colors?.surface || '#f8fafc';
  const textColor = pickBestText(background, false);
  const isDark = textColor === TEXT_ON_DARK;
  const mutedColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(26,26,26,0.75)';
  return { background, textColor, mutedColor, isDark };
}

/** Readability tokens for the footer. */
export function getFooterReadability(snap) {
  const background = snap.colors?.footerBg || '#0f172a';
  const textColor = pickBestText(background, false);
  const mutedColor = textColor === TEXT_ON_DARK ? 'rgba(255,255,255,0.85)' : 'rgba(26,26,26,0.75)';
  return { background, textColor, mutedColor };
}

/** CSS variables for readable themed pages. */
export function readabilityStyleVars(snap, hasBgImage) {
  const hero = getHeroReadability(snap, hasBgImage);
  const surface = getSurfaceReadability(snap);
  const footer = getFooterReadability(snap);
  return {
    '--theme-hero-readable': hero.textColor,
    '--theme-hero-readable-muted': hero.mutedColor,
    '--theme-surface-readable': surface.textColor,
    '--theme-surface-readable-muted': surface.mutedColor,
    '--theme-footer-readable': footer.textColor,
    '--theme-footer-readable-muted': footer.mutedColor,
  };
}
