import { useEffect } from 'react';
import { resolveMediaUrl } from '../../utils/format.js';
import { googleFontsHref, publicEventTypeLabel, themeStyleVars } from '../../utils/eventTheme.js';
import {
  getFooterReadability,
  getHeroReadability,
  getSurfaceReadability,
  readabilityStyleVars,
} from '../../utils/themeReadability.js';
import { resolveLayoutVariant } from '../../utils/themeLayouts.js';
import ThemeMusicToggle from './ThemeMusicToggle.jsx';
import { getThemeLayoutComponent } from './layouts/index.js';

/**
 * Shared themed page shell: background, CSS variables, fonts, music.
 * Layout components render inside for structurally unique designs.
 */
export default function ThemeLayoutShell({ ctx, children }) {
  const { snap, style, event, coupleTitle, themeBg, hasBgImage, heroRead, surfaceRead, goldBorder } = ctx;
  const vars = themeStyleVars(snap);
  const readVars = readabilityStyleVars(snap, hasBgImage);
  const fontsHref = googleFontsHref(snap);
  const layoutKey = resolveLayoutVariant(snap);

  useEffect(() => {
    if (!fontsHref) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontsHref;
    document.head.appendChild(link);
    return () => link.remove();
  }, [fontsHref]);

  return (
    <div
      className={`themed-watch layout-${layoutKey} relative min-h-screen overflow-x-hidden ${goldBorder ? 'themed-watch-regional' : ''} ${heroRead.isDark ? 'themed-watch-hero-dark' : 'themed-watch-hero-light'} ${surfaceRead.isDark ? 'themed-watch-surface-dark' : 'themed-watch-surface-light'}`}
      style={{
        ...vars,
        ...readVars,
        fontFamily: 'var(--theme-font-body)',
        backgroundColor: 'var(--theme-surface)',
        color: 'var(--theme-surface-readable)',
      }}
    >
      <div className="theme-bg-fixed" aria-hidden>
        {themeBg && (
          <img
            src={themeBg}
            alt=""
            className="theme-bg-image"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
        <div
          className="theme-bg-overlay"
          style={{
            background: `linear-gradient(135deg,
              color-mix(in srgb, var(--theme-gradient-from) 55%, transparent) 0%,
              color-mix(in srgb, var(--theme-secondary) 40%, transparent) 40%,
              color-mix(in srgb, var(--theme-footer-bg) 70%, transparent) 100%)`,
          }}
        />
      </div>

      {children}

      <ThemeMusicToggle musicUrl={style.backgroundMusic} />
    </div>
  );
}

/** Build shared context object for layout components. */
export function buildThemeWatchContext(props) {
  const {
    event,
    coupleTitle,
    watchUrl,
    mergedConfig,
    room,
    chatOn,
    activeTab,
    setTab,
    canAnswer,
    playerNonce,
  } = props;

  const snap = event.themeSnapshot || {};
  const style = snap.style || {};
  const themeBg = resolveMediaUrl(snap.backgroundImage);
  const couplePhoto = event.coverImage ? resolveMediaUrl(event.coverImage) : '';
  const hasBgImage = Boolean(themeBg);
  const heroRead = getHeroReadability(snap, hasBgImage);
  const surfaceRead = getSurfaceReadability(snap);
  const footerRead = getFooterReadability(snap);
  const title = coupleTitle || event.title;
  const eventTypeLabel = publicEventTypeLabel(snap.category);
  const goldBorder = Boolean(style.goldBorder);

  return {
    snap,
    style,
    event,
    coupleTitle,
    watchUrl,
    mergedConfig,
    room,
    chatOn,
    activeTab,
    setTab,
    canAnswer,
    playerNonce,
    themeBg,
    couplePhoto,
    hasBgImage,
    heroRead,
    surfaceRead,
    footerRead,
    title,
    eventTypeLabel,
    goldBorder,
  };
}

export function ThemeLayoutRouter(props) {
  const ctx = buildThemeWatchContext(props);
  const Layout = getThemeLayoutComponent(ctx.snap);
  return (
    <ThemeLayoutShell ctx={ctx}>
      <Layout {...ctx} />
    </ThemeLayoutShell>
  );
}
