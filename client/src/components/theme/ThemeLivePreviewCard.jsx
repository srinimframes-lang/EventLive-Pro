import { resolveMediaUrl } from '../../utils/format.js';

/** Image-first theme card for the simplified gallery. */
export default function ThemeLivePreviewCard({ theme, selected, onOpen, onUseTheme }) {
  const bg = resolveMediaUrl(theme.backgroundImage);

  return (
    <article
      className={`overflow-hidden rounded-xl border-2 bg-white shadow-sm transition hover:shadow-md ${
        selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        className="relative block w-full text-left"
        onClick={onOpen}
        aria-label={`Preview ${theme.name}`}
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {bg ? (
            <img
              src={bg}
              alt={theme.name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-sm text-slate-400"
              style={{ backgroundColor: theme.colors?.surface || '#f1f5f9' }}
            >
              No preview
            </div>
          )}
          {selected && (
            <span className="absolute right-2 top-2 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              Selected
            </span>
          )}
        </div>
        <div className="px-3 py-2">
          <h4 className="truncate text-sm font-semibold text-slate-900">{theme.name}</h4>
          {theme.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{theme.description}</p>
          )}
        </div>
      </button>
      <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
        <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={onOpen}>
          Preview
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
            selected ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
          }`}
          onClick={onUseTheme}
        >
          {selected ? 'Selected ✓' : 'Use Theme'}
        </button>
      </div>
    </article>
  );
}
