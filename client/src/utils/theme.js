// Runtime brand theming for white-label custom domains. Given a single primary
// hex color we derive a 50–900 scale (tints toward white, shades toward black)
// and write them to CSS variables that Tailwind's `brand-*` classes consume.

const SHADES = {
  50: { mix: '#ffffff', amount: 0.95 },
  100: { mix: '#ffffff', amount: 0.9 },
  200: { mix: '#ffffff', amount: 0.75 },
  300: { mix: '#ffffff', amount: 0.55 },
  400: { mix: '#ffffff', amount: 0.3 },
  500: { mix: '#ffffff', amount: 0.12 },
  600: { mix: null, amount: 0 }, // base
  700: { mix: '#000000', amount: 0.12 },
  800: { mix: '#000000', amount: 0.25 },
  900: { mix: '#000000', amount: 0.45 },
};

function parseHex(hex) {
  const h = String(hex || '').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function mix(base, withHex, amount) {
  if (!withHex || amount === 0) return base;
  const t = parseHex(withHex);
  const blend = (a, b) => Math.round(a + (b - a) * amount);
  return { r: blend(base.r, t.r), g: blend(base.g, t.g), b: blend(base.b, t.b) };
}

/** Applies a primary hex color as the brand palette on :root. No-op if invalid. */
export function applyBrandColor(hex) {
  const base = parseHex(hex);
  if (!base) return false;
  const root = document.documentElement;
  for (const [shade, { mix: m, amount }] of Object.entries(SHADES)) {
    const c = mix(base, m, amount);
    root.style.setProperty(`--brand-${shade}`, `${c.r} ${c.g} ${c.b}`);
  }
  return true;
}

/** Clears any runtime overrides, restoring the default palette from index.css. */
export function resetBrandColor() {
  const root = document.documentElement;
  for (const shade of Object.keys(SHADES)) {
    root.style.removeProperty(`--brand-${shade}`);
  }
}
