/** Gallery filter categories shown in the theme picker UI. */
export const GALLERY_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'reception', label: 'Reception' },
  { id: 'sangeet', label: 'Sangeet' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'baby_shower', label: 'Baby Shower' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'anniversary', label: 'Anniversary' },
  { id: 'corporate', label: 'Corporate' },
];

const FAVORITES_KEY = 'eventlive_theme_favorites';

/** Map a theme document to a gallery filter bucket. */
export function galleryCategory(theme) {
  const name = (theme.name || '').toLowerCase();
  const slug = (theme.slug || '').toLowerCase();
  if (name.includes('anniversary') || slug.includes('anniversary')) return 'anniversary';

  switch (theme.category) {
    case 'reception':
      return 'reception';
    case 'sangeet':
      return 'sangeet';
    case 'birthday':
      return 'birthday';
    case 'baby_shower':
      return 'baby_shower';
    case 'engagement':
      return 'engagement';
    case 'corporate':
      return 'corporate';
    case 'wedding':
    case 'temple':
    case 'haldi':
    case 'mehendi':
    case 'house_warming':
    default:
      return 'wedding';
  }
}

export function loadFavoriteIds() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export function toggleFavoriteId(id) {
  const ids = loadFavoriteIds();
  const set = new Set(ids);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = [...set];
  saveFavoriteIds(next);
  return next;
}

export function themeMatchesSearch(theme, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const hay = [
    theme.name,
    theme.description,
    theme.heroLabel,
    theme.category,
    theme.region,
    theme.slug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export const GALLERY_PAGE_SIZE = 12;
