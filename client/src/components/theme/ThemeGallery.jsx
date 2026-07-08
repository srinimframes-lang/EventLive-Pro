import { useMemo, useState } from 'react';
import ThemePreviewModal from '../admin/ThemePreviewModal.jsx';
import ThemeLivePreviewCard from './ThemeLivePreviewCard.jsx';
import { groupThemesByCategory, themeMatchesSearch } from '../../utils/themeGallery.js';
import { THEME_CATEGORY_LABELS } from '../../utils/eventTheme.js';

/**
 * Simple theme picker — themes grouped by category with image previews.
 */
export default function ThemeGallery({ themes, selectedId, onSelect, loading }) {
  const [search, setSearch] = useState('');
  const [previewTheme, setPreviewTheme] = useState(null);

  const filtered = useMemo(() => {
    const list = themes || [];
    if (!search.trim()) return list;
    return list.filter((t) => themeMatchesSearch(t, search));
  }, [themes, search]);

  const groups = useMemo(() => groupThemesByCategory(filtered), [filtered]);

  const applyTheme = (theme) => {
    onSelect(theme.id || theme._id);
    setPreviewTheme(null);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">Loading themes…</div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        type="search"
        className="input"
        placeholder="Search themes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search themes"
      />

      {groups.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No themes match your search.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.id} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
              {THEME_CATEGORY_LABELS[group.id] || group.label}
              <span className="ml-2 font-normal text-slate-400">({group.themes.length})</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.themes.map((theme) => {
                const tid = theme.id || theme._id;
                return (
                  <ThemeLivePreviewCard
                    key={tid}
                    theme={theme}
                    selected={selectedId === tid}
                    onOpen={() => setPreviewTheme(theme)}
                    onUseTheme={() => applyTheme(theme)}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}

      {selectedId && (
        <p className="text-xs text-emerald-700">Theme selected — it will appear on your live watch page.</p>
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
