/** Premium layout variants — each maps to a unique watch-page structure. */
export const LAYOUT_VARIANTS = [
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
];

export const LAYOUT_LABELS = {
  'royal-palace': 'Royal Palace',
  'luxury-gold': 'Luxury Gold',
  'floral-garden': 'Floral Garden',
  'south-indian-traditional': 'South Indian Traditional',
  'modern-minimal': 'Modern Minimal',
  'sunset-romance': 'Sunset Romance',
  'emerald-wedding': 'Emerald Wedding',
  'vintage-classic': 'Vintage Classic',
  'crystal-wedding': 'Crystal Wedding',
  'night-sky-wedding': 'Night Sky Wedding',
};

export function resolveLayoutVariant(snapshot) {
  const v = snapshot?.layoutVariant || snapshot?.style?.layoutVariant || '';
  if (LAYOUT_VARIANTS.includes(v)) return v;
  return 'royal-palace';
}
