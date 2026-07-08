import { formatDateTime, resolveMediaUrl } from '../../utils/format.js';
import { themeStyleVars, googleFontsHref } from '../../utils/eventTheme.js';
import { getHeroReadability, readabilityStyleVars } from '../../utils/themeReadability.js';
import { useEffect } from 'react';
import ThemeEffects from '../theme/ThemeEffects.jsx';
import ThemeDecor from '../theme/ThemeDecor.jsx';
import PremiumButton from '../theme/PremiumButton.jsx';
import GlassCard from '../theme/GlassCard.jsx';

/** Mini preview of a theme template for the admin panel. */
export default function ThemePreviewModal({ theme, onClose, onApply }) {
  const snap = theme;
  const style = snap.style || {};
  const vars = themeStyleVars(snap);
  const fontsHref = googleFontsHref(snap);
  const bg = resolveMediaUrl(snap.backgroundImage);
  const heroRead = getHeroReadability(snap, Boolean(bg));
  const readVars = readabilityStyleVars(snap, Boolean(bg));

  useEffect(() => {
    if (!fontsHref) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontsHref;
    document.head.appendChild(link);
    return () => link.remove();
  }, [fontsHref]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-slate-900">Theme preview — {snap.name}</h3>
          <div className="flex items-center gap-2">
            {onApply && (
              <button type="button" className="btn-primary px-4 py-1.5 text-sm" onClick={onApply}>
                Use Theme
              </button>
            )}
            <button type="button" className="btn-ghost px-2" onClick={onClose}>✕</button>
          </div>
        </div>
        <div
          className={`themed-watch-preview ${heroRead.isDark ? 'themed-watch-hero-dark' : 'themed-watch-hero-light'}`}
          style={{ ...vars, ...readVars, fontFamily: 'var(--theme-font-body)' }}
        >
          <div className="relative isolate min-h-[240px] overflow-hidden">
            {bg && (
              <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
            )}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, var(--theme-gradient-from) 55%, transparent), color-mix(in srgb, var(--theme-footer-bg) 70%, transparent))`,
              }}
            />
            <ThemeEffects
              particleStyle={style.particleStyle || 'bokeh'}
              gradientFrom={style.gradientFrom}
              gradientTo={style.gradientTo}
            />
            <ThemeDecor iconSet={style.iconSet} decoration={style.decoration} />
            <div
              className={`theme-hero-content relative z-10 px-4 py-10 text-center ${heroRead.needsBackdrop ? 'theme-hero-backdrop mx-4' : ''}`}
              style={{ color: 'var(--theme-hero-readable)' }}
            >
              <p className="theme-hero-label text-xs font-bold uppercase tracking-widest">
                {snap.heroLabel || 'Live'}
              </p>
              <h1
                className="theme-hero-title mt-2 text-2xl font-extrabold"
                style={{ fontFamily: 'var(--theme-font-heading)' }}
              >
                Sample Couple Names
              </h1>
              <p className="theme-hero-meta mt-2 text-sm font-bold">{formatDateTime(new Date().toISOString())}</p>
              <p className="theme-hero-meta text-sm font-bold">Grand Ballroom, Mumbai</p>
              <PremiumButton
                buttonStyle={style.buttonStyle || 'pill-glow'}
                heroIsDark={heroRead.isDark}
                className="mt-4 px-6 py-2 text-sm font-extrabold"
              >
                Watch Live
              </PremiumButton>
            </div>
          </div>
          <div className="p-4" style={{ backgroundColor: 'var(--theme-surface)' }}>
            <GlassCard className="p-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--theme-secondary)' }}>
                Gallery section
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="aspect-square rounded-lg bg-white/20" />
                ))}
              </div>
            </GlassCard>
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
