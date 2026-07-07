import { resolveMediaUrl } from '../../utils/format.js';
import { themeStyleVars } from '../../utils/eventTheme.js';
import { THEME_REGION_LABELS } from '../../utils/eventTheme.js';

/** Compact live-preview card for the theme gallery grid. */
export default function ThemeLivePreviewCard({
  theme,
  selected,
  favorited,
  onOpen,
  onToggleFavorite,
  onUseTheme,
  index = 0,
}) {
  const primary = theme.colors?.primary || '#6366f1';
  const vars = themeStyleVars(theme);
  const delay = `${Math.min(index % 8, 7) * 0.05}s`;

  return (
    <article
      className={`theme-live-card theme-animate-fade-up ${selected ? 'theme-live-card-selected' : ''}`}
      style={{ ...vars, animationDelay: delay }}
    >
      <button
        type="button"
        className="theme-live-card-hit"
        onClick={onOpen}
        aria-label={`Preview ${theme.name}`}
      >
        <div className="theme-live-card-stage">
          {theme.backgroundImage && (
            <img
              src={resolveMediaUrl(theme.backgroundImage)}
              alt=""
              className="theme-live-card-bg"
              loading="lazy"
              decoding="async"
            />
          )}
          <div
            className="theme-live-card-overlay"
            style={{
              background: `linear-gradient(160deg, color-mix(in srgb, ${primary} 55%, transparent), color-mix(in srgb, ${theme.colors?.footerBg || '#000'} 75%, transparent))`,
            }}
          />
          <div className="theme-live-card-shimmer" aria-hidden />
          <div className="theme-live-card-mini relative z-10 p-3 text-left text-white">
            <p
              className="text-[10px] uppercase tracking-widest opacity-90"
              style={{ color: theme.colors?.accent || '#fde68a' }}
            >
              {theme.heroLabel || 'Live'}
            </p>
            <p
              className="mt-1 line-clamp-1 text-sm font-bold drop-shadow"
              style={{ fontFamily: 'var(--theme-font-heading)' }}
            >
              {theme.name}
            </p>
          </div>
          {theme.isPremium && (
            <span className="theme-live-badge theme-live-badge-premium">Premium</span>
          )}
          {theme.region && (
            <span className="theme-live-badge theme-live-badge-region">
              {THEME_REGION_LABELS[theme.region]}
            </span>
          )}
          {selected && <span className="theme-live-badge theme-live-badge-active">Selected</span>}
        </div>
      </button>

      <div className="theme-live-card-footer">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-slate-900">{theme.name}</h4>
          <div className="mt-1 flex gap-1">
            {[primary, theme.colors?.secondary, theme.colors?.accent].filter(Boolean).map((c) => (
              <span
                key={c}
                className="h-3 w-3 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className={`theme-fav-btn ${favorited ? 'theme-fav-btn-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          {favorited ? '★' : '☆'}
        </button>
      </div>

      <div className="theme-live-card-actions">
        <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={onOpen}>
          Full Preview
        </button>
        <button
          type="button"
          className={`theme-use-btn flex-1 ${selected ? 'theme-use-btn-active' : ''}`}
          onClick={onUseTheme}
        >
          {selected ? 'In Use ✓' : 'Use Theme'}
        </button>
      </div>
    </article>
  );
}
