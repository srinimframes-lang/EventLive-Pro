import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThemePreviewModal from '../admin/ThemePreviewModal.jsx';
import ThemeLivePreviewCard from './ThemeLivePreviewCard.jsx';
import {
  GALLERY_CATEGORIES,
  GALLERY_PAGE_SIZE,
  galleryCategory,
  loadFavoriteIds,
  themeMatchesSearch,
  toggleFavoriteId,
} from '../../utils/themeGallery.js';

/**
 * Modern theme gallery — vertical scroll, search, category filter, favorites,
 * infinite load, live preview cards, and full preview modal.
 */
export default function ThemeGallery({ themes, selectedId, onSelect, loading }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteIds());
  const [previewTheme, setPreviewTheme] = useState(null);
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE_SIZE);
  const sentinelRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    let list = themes || [];
    if (category !== 'all') {
      list = list.filter((t) => galleryCategory(t) === category);
    }
    if (favoritesOnly) {
      list = list.filter((t) => favoriteIds.includes(t.id || t._id));
    }
    if (search.trim()) {
      list = list.filter((t) => themeMatchesSearch(t, search));
    }
    return list;
  }, [themes, category, favoritesOnly, favoriteIds, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    setVisibleCount(GALLERY_PAGE_SIZE);
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [category, search, favoritesOnly]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) => Math.min(n + GALLERY_PAGE_SIZE, filtered.length));
        }
      },
      { root: listRef.current, rootMargin: '120px', threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  const handleFavorite = useCallback((id) => {
    setFavoriteIds(toggleFavoriteId(id));
  }, []);

  const applyTheme = useCallback(
    (theme) => {
      onSelect(theme.id || theme._id);
      setPreviewTheme(null);
    },
    [onSelect]
  );

  if (loading) {
    return (
      <div className="theme-gallery-loading">
        <div className="theme-gallery-loading-pulse" />
        <p className="text-sm text-slate-500">Loading theme gallery…</p>
      </div>
    );
  }

  return (
    <div className="theme-gallery-modern">
      <div className="theme-gallery-toolbar">
        <div className="relative flex-1">
          <input
            type="search"
            className="input theme-gallery-search pl-9"
            placeholder="Search themes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search themes"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
        </div>
        <button
          type="button"
          className={`theme-gallery-fav-filter shrink-0 ${favoritesOnly ? 'theme-gallery-fav-filter-on' : ''}`}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          ★ Favorites{favoriteIds.length ? ` (${favoriteIds.length})` : ''}
        </button>
      </div>

      <div className="theme-gallery-cats" role="tablist">
        {GALLERY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`theme-gallery-cat ${category === c.id ? 'theme-gallery-cat-active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} theme{filtered.length !== 1 ? 's' : ''}
        {selectedId ? ' · 1 selected' : ''}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No themes match your search. Try another category or clear filters.
        </p>
      ) : (
        <div ref={listRef} className="theme-gallery-scroll-y">
          <div className="theme-gallery-grid">
            {visible.map((t, i) => {
              const tid = t.id || t._id;
              return (
                <ThemeLivePreviewCard
                  key={tid}
                  theme={t}
                  index={i}
                  selected={selectedId === tid}
                  favorited={favoriteIds.includes(tid)}
                  onOpen={() => setPreviewTheme(t)}
                  onToggleFavorite={() => handleFavorite(tid)}
                  onUseTheme={() => applyTheme(t)}
                />
              );
            })}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="theme-gallery-sentinel">
              <span className="theme-gallery-sentinel-dot" />
              <span className="text-xs text-slate-400">Loading more themes…</span>
            </div>
          )}
        </div>
      )}

      {previewTheme && (
        <ThemePreviewModal
          theme={previewTheme}
          onClose={() => setPreviewTheme(null)}
          onApply={() => applyTheme(previewTheme)}
        />
      )}
    </div>
  );
}
