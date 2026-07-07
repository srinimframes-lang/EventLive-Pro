import { formatDateTime } from '../../utils/format.js';
import { themeStyleVars, googleFontsHref } from '../../utils/eventTheme.js';
import { useEffect } from 'react';

/** Mini preview of a theme template for the admin panel. */
export default function ThemePreviewModal({ theme, onClose }) {
  const snap = theme;
  const vars = themeStyleVars(snap);
  const fontsHref = googleFontsHref(snap);

  useEffect(() => {
    if (!fontsHref) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontsHref;
    document.head.appendChild(link);
    return () => link.remove();
  }, [fontsHref]);

  const bg = snap.backgroundImage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-slate-900">Theme preview — {snap.name}</h3>
          <button type="button" className="btn-ghost px-2" onClick={onClose}>✕</button>
        </div>
        <div style={{ ...vars, fontFamily: 'var(--theme-font-body)' }}>
          <div className="relative min-h-[200px] text-[var(--theme-hero-text)]">
            {bg && (
              <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <div className="relative bg-gradient-to-t from-black/80 to-black/30 px-4 py-10 text-center">
              <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--theme-accent)' }}>
                {snap.heroLabel || 'Live'}
              </p>
              <h1
                className="mt-2 text-2xl font-bold"
                style={{ fontFamily: 'var(--theme-font-heading)' }}
              >
                Sample Event Title
              </h1>
              <p className="mt-2 text-sm opacity-90">{formatDateTime(new Date().toISOString())}</p>
              <p className="text-sm opacity-90">Grand Ballroom, Mumbai</p>
              <span
                className="mt-4 inline-block rounded-full px-6 py-2 text-sm font-bold text-white"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                Watch Live
              </span>
            </div>
          </div>
          <div className="p-4" style={{ backgroundColor: 'var(--theme-surface)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--theme-secondary)' }}>
              Gallery section
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-square rounded-lg bg-slate-200" />
              ))}
            </div>
          </div>
          <footer
            className="px-4 py-4 text-center text-xs"
            style={{ backgroundColor: 'var(--theme-footer-bg)', color: 'var(--theme-footer-text)' }}
          >
            {snap.footerText || '© Sample footer'}
          </footer>
        </div>
      </div>
    </div>
  );
}
