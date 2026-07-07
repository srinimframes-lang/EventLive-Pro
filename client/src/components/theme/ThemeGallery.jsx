import { useMemo, useRef, useState } from 'react';
import { resolveMediaUrl } from '../../utils/format.js';
import { THEME_REGION_LABELS, THEME_REGIONS } from '../../utils/eventTheme.js';
import ThemePreviewModal from '../admin/ThemePreviewModal.jsx';

/**
 * South Indian regional theme gallery with state tabs, scrollable cards,
 * live preview, and one-click apply.
 */
export default function ThemeGallery({
  themes,
  selectedId,
  onSelect,
  loading,
}) {
  const [activeRegion, setActiveRegion] = useState(THEME_REGIONS[0]);
  const [previewTheme, setPreviewTheme] = useState(null);
  const scrollRef = useRef(null);

  const regional = useMemo(
    () => themes.filter((t) => t.region && THEME_REGIONS.includes(t.region)),
    [themes]
  );

  const byRegion = useMemo(() => {
    const map = {};
    for (const r of THEME_REGIONS) map[r] = [];
    for (const t of regional) {
      if (map[t.region]) map[t.region].push(t);
    }
    for (const r of THEME_REGIONS) {
      map[r].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }
    return map;
  }, [regional]);

  const current = byRegion[activeRegion] || [];

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading regional themes…</p>;
  }

  if (!regional.length) {
    return <p className="text-sm text-slate-500">No regional themes available yet.</p>;
  }

  return (
    <div className="theme-gallery space-y-4">
      <div className="flex flex-wrap gap-2">
        {THEME_REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRegion(r)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activeRegion === r
                ? 'bg-gold-500 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {THEME_REGION_LABELS[r]}
            <span className="ml-1.5 opacity-75">({byRegion[r]?.length || 0})</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="Scroll left"
          className="theme-gallery-nav theme-gallery-nav-left"
          onClick={() => scroll(-1)}
        >
          ‹
        </button>
        <div ref={scrollRef} className="theme-gallery-scroll flex gap-4 overflow-x-auto pb-2">
          {current.map((t) => (
            <ThemeCard
              key={t.id || t._id}
              theme={t}
              selected={selectedId === (t.id || t._id)}
              onPreview={() => setPreviewTheme(t)}
              onApply={() => onSelect(t.id || t._id)}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Scroll right"
          className="theme-gallery-nav theme-gallery-nav-right"
          onClick={() => scroll(1)}
        >
          ›
        </button>
      </div>

      {previewTheme && (
        <ThemePreviewModal
          theme={previewTheme}
          onClose={() => setPreviewTheme(null)}
          onApply={() => {
            onSelect(previewTheme.id || previewTheme._id);
            setPreviewTheme(null);
          }}
        />
      )}
    </div>
  );
}

function ThemeCard({ theme, selected, onPreview, onApply }) {
  const primary = theme.colors?.primary || '#b45309';

  return (
    <article
      className={`theme-gallery-card shrink-0 ${selected ? 'theme-gallery-card-selected' : ''}`}
      style={{ '--card-primary': primary }}
    >
      <div
        className="theme-gallery-card-bg"
        style={{
          backgroundImage: theme.backgroundImage
            ? `url(${resolveMediaUrl(theme.backgroundImage)})`
            : undefined,
          backgroundColor: primary,
        }}
      >
        <span className="theme-gallery-gold-frame" aria-hidden />
        {theme.isPremium && (
          <span className="absolute left-2 top-2 rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            Premium
          </span>
        )}
        {theme.region && (
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {THEME_REGION_LABELS[theme.region]}
          </span>
        )}
      </div>
      <div className="p-3">
        <h4 className="font-semibold text-slate-900 line-clamp-1">{theme.name}</h4>
        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{theme.description}</p>
        <div className="mt-2 flex gap-1">
          {[primary, theme.colors?.secondary, theme.colors?.accent].filter(Boolean).map((c) => (
            <span key={c} className="h-3.5 w-3.5 rounded-full border border-white shadow" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-ghost flex-1 px-2 py-1 text-xs" onClick={onPreview}>
            Preview
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-2 py-1 text-xs font-bold text-white transition ${
              selected ? 'bg-emerald-600' : 'bg-gold-500 hover:bg-gold-600'
            }`}
            onClick={onApply}
          >
            {selected ? 'Applied ✓' : 'Apply Theme'}
          </button>
        </div>
      </div>
    </article>
  );
}
