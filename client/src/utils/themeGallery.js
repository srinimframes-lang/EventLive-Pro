/** Curated theme categories shown in the theme picker (20 themes total). */
export const GALLERY_CATEGORIES = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'reception', label: 'Reception' },
  { id: 'sangeet', label: 'Sangeet' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'upanayanam', label: 'Upanayanam' },
  { id: 'half_saree', label: 'Half Saree' },
];

/** Group themes by their category field. */
export function groupThemesByCategory(themes) {
  const groups = GALLERY_CATEGORIES.map((cat) => ({
    ...cat,
    themes: (themes || []).filter((t) => t.category === cat.id),
  }));
  return groups.filter((g) => g.themes.length > 0);
}

export function themeMatchesSearch(theme, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const hay = [theme.name, theme.description, theme.heroLabel, theme.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}
