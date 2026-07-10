/** Standard IAB banner sizes (server validation). */
export const BANNER_SIZE_PRESETS = [
  '320x50',
  '320x100',
  '468x60',
  '728x90',
  '970x90',
  '970x250',
  'auto',
];

export const BANNER_FIT_MODES = ['contain', 'cover'];

export function normalizeSizePreset(value, mobileSize) {
  if (value && BANNER_SIZE_PRESETS.includes(value)) return value;
  if (mobileSize === '100') return '320x100';
  if (mobileSize === '50') return '320x50';
  return '728x90';
}

export function normalizeFitMode(value) {
  return value === 'cover' ? 'cover' : 'contain';
}
