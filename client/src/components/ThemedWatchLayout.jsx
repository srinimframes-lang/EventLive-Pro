import { useEffect } from 'react';
import { formatDateTime, resolveMediaUrl } from '../utils/format.js';
import {
  googleFontsHref,
  themeStyleVars,
} from '../utils/eventTheme.js';
import {
  getFooterReadability,
  getHeroReadability,
  getSurfaceReadability,
  readabilityStyleVars,
} from '../utils/themeReadability.js';
import LivePlayer from './live/LivePlayer.jsx';
import LiveChat from './live/LiveChat.jsx';
import QAPanel from './live/QAPanel.jsx';
import ViewerCount from './live/ViewerCount.jsx';
import PhotoGallery from './PhotoGallery.jsx';
import ShareButtons from './ShareButtons.jsx';
import ThemeEffects from './theme/ThemeEffects.jsx';
import ThemeDecor from './theme/ThemeDecor.jsx';
import PremiumButton from './theme/PremiumButton.jsx';
import GlassCard from './theme/GlassCard.jsx';
import ThemeGoldBorder from './theme/ThemeGoldBorder.jsx';
import ThemeMusicToggle from './theme/ThemeMusicToggle.jsx';

/**
 * Premium themed watch layout. Uses the event's frozen themeSnapshot so
 * catalog edits never change existing live pages.
 */
export default function ThemedWatchLayout({
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
}) {
  const snap = event.themeSnapshot || {};
  const style = snap.style || {};
  const themeBg = resolveMediaUrl(snap.backgroundImage);
  const couplePhoto = event.coverImage ? resolveMediaUrl(event.coverImage) : '';
  const vars = themeStyleVars(snap);
  const fontsHref = googleFontsHref(snap);
  const hasBgImage = Boolean(themeBg);

  const heroRead = getHeroReadability(snap, hasBgImage);
  const surfaceRead = getSurfaceReadability(snap);
  const footerRead = getFooterReadability(snap);
  const readVars = readabilityStyleVars(snap, hasBgImage);

  useEffect(() => {
    if (!fontsHref) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontsHref;
    document.head.appendChild(link);
    return () => link.remove();
  }, [fontsHref]);

  const title = coupleTitle || event.title;
  const heroLabel = snap.heroLabel || 'Live';
  const goldBorder = Boolean(style.goldBorder);

  return (
    <div
      className={`themed-watch relative min-h-screen overflow-x-hidden ${goldBorder ? 'themed-watch-regional' : ''} ${heroRead.isDark ? 'themed-watch-hero-dark' : 'themed-watch-hero-light'} ${surfaceRead.isDark ? 'themed-watch-surface-dark' : 'themed-watch-surface-light'}`}
      style={{
        ...vars,
        ...readVars,
        fontFamily: 'var(--theme-font-body)',
        backgroundColor: 'var(--theme-surface)',
        color: 'var(--theme-surface-readable)',
      }}
    >
      {/* Full-screen fixed background */}
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

      {/* Hero — text layer above all decorative effects */}
      <header className="theme-hero relative isolate overflow-hidden">
        <ThemeEffects
          particleStyle={style.particleStyle || 'bokeh'}
          gradientFrom={style.gradientFrom}
          gradientTo={style.gradientTo}
        />
        <ThemeDecor iconSet={style.iconSet} decoration={style.decoration} />
        <ThemeGoldBorder enabled={goldBorder} className="relative z-10">
          <div className="theme-hero-inner px-4 py-12 sm:py-20" style={{ minHeight: 'min(48vh, 460px)' }}>
            <div
              className={`theme-hero-content mx-auto max-w-4xl text-center ${heroRead.needsBackdrop ? 'theme-hero-backdrop' : ''}`}
              style={{ color: 'var(--theme-hero-readable)' }}
            >
              {couplePhoto && (
                <img
                  src={couplePhoto}
                  alt={title}
                  className="theme-couple-photo mx-auto mb-5 h-28 w-28 rounded-full border-4 object-cover sm:h-32 sm:w-32"
                  style={{ borderColor: 'var(--theme-accent)' }}
                />
              )}
              {(event.photographerLogo || event.photographerName) && (
                <GlassCard className="theme-photographer-badge mx-auto mb-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold" solid>
                  {event.photographerLogo && (
                    <img
                      src={resolveMediaUrl(event.photographerLogo)}
                      alt={event.photographerName || 'Photographer logo'}
                      className="h-8 w-8 rounded-md object-contain"
                    />
                  )}
                  {event.photographerName && <span>Captured by {event.photographerName}</span>}
                </GlassCard>
              )}
              <p className="theme-hero-label text-xs font-bold uppercase tracking-[0.35em] sm:text-sm">
                {heroLabel}
              </p>
              <h1
                className="theme-hero-title mt-3 text-[2rem] font-extrabold leading-tight sm:text-5xl md:text-6xl"
                style={{ fontFamily: 'var(--theme-font-heading)' }}
              >
                {title}
              </h1>
              <div className="theme-hero-meta mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base font-bold sm:text-lg">
                {event.startTime && <span>{formatDateTime(event.startTime)}</span>}
                {event.venue && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden>📍</span>
                    {event.venue}
                  </span>
                )}
              </div>
              <PremiumButton
                as="a"
                href="#watch-player"
                buttonStyle={style.buttonStyle || 'pill-glow'}
                heroIsDark={heroRead.isDark}
                className="mt-8 gap-2 px-10 py-3.5 text-base font-extrabold sm:text-lg"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
                </span>
                Watch Live
              </PremiumButton>
            </div>
          </div>
        </ThemeGoldBorder>
      </header>

      <ThemeMusicToggle musicUrl={style.backgroundMusic} />

      <main className="relative z-10 mx-auto max-w-7xl px-3 py-8 sm:px-4">
        <div id="watch-player" className="grid gap-6 lg:grid-cols-3">
          <div className="theme-animate-fade-up theme-animate-delay-1 lg:col-span-2">
            <GlassCard className="overflow-hidden p-0" dark={surfaceRead.isDark} solid>
              <LivePlayer key={playerNonce} config={mergedConfig} />
            </GlassCard>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-xl font-extrabold sm:text-2xl"
                style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-surface-readable)' }}
              >
                {event.title}
              </h2>
              <ViewerCount count={room?.viewers || 0} isLive={mergedConfig?.isLive} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ShareButtons url={watchUrl} title={title} />
            </div>
            {event.description && (
              <GlassCard className="theme-readable-body mt-4 text-base font-medium leading-relaxed" dark={surfaceRead.isDark} solid>
                <p className="whitespace-pre-wrap">{event.description}</p>
              </GlassCard>
            )}
          </div>

          <div className="theme-animate-fade-up theme-animate-delay-2 lg:col-span-1">
            <GlassCard className="flex h-[60vh] flex-col overflow-hidden p-0 sm:h-[70vh]" dark={surfaceRead.isDark} solid>
              <div className="flex border-b border-slate-200">
                {chatOn && (
                  <ThemedTab active={activeTab === 'chat'} onClick={() => setTab('chat')}>
                    Chat
                  </ThemedTab>
                )}
                <ThemedTab active={activeTab === 'qa'} onClick={() => setTab('qa')}>
                  Q&amp;A {(room?.questions?.length || 0) > 0 && `(${room.questions.length})`}
                </ThemedTab>
              </div>
              <div className="min-h-0 flex-1 bg-white">
                {activeTab === 'chat' ? (
                  <LiveChat messages={room?.messages || []} onSend={room?.sendMessage} disabled={!room?.connected} />
                ) : (
                  <QAPanel
                    questions={room?.questions || []}
                    onAsk={room?.askQuestion}
                    onUpvote={room?.upvoteQuestion}
                    onAnswer={room?.answerQuestion}
                    canAnswer={canAnswer}
                    disabled={!room.connected}
                  />
                )}
              </div>
            </GlassCard>
          </div>
        </div>

        <section className="theme-animate-fade-up theme-animate-delay-3 mt-12">
          <GlassCard className="mb-4 flex items-center justify-between" dark={surfaceRead.isDark} solid>
            <h2
              className="text-xl font-extrabold sm:text-2xl"
              style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-surface-readable)' }}
            >
              Photo Gallery
            </h2>
            <span className="text-sm font-semibold" style={{ color: 'var(--theme-surface-readable-muted)' }}>
              {event.gallery?.length || 0} photos
            </span>
          </GlassCard>
          <PhotoGallery photos={event.gallery || []} />
        </section>
      </main>

      <footer
        className="theme-footer relative z-10 mt-10 px-4 py-10 text-center text-base font-semibold"
        style={{
          backgroundColor: 'var(--theme-footer-bg)',
          color: 'var(--theme-footer-readable)',
        }}
      >
        <p style={{ fontFamily: 'var(--theme-font-heading)' }} className="text-xl font-extrabold">
          {title}
        </p>
        {snap.footerText && (
          <p className="mt-2 font-medium" style={{ color: 'var(--theme-footer-readable-muted)' }}>
            {snap.footerText}
          </p>
        )}
        {event.venue && (
          <p className="mt-1 font-medium" style={{ color: 'var(--theme-footer-readable-muted)' }}>
            {event.venue}
          </p>
        )}
      </footer>
    </div>
  );
}

function ThemedTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-4 py-3 text-sm font-bold transition"
      style={
        active
          ? { borderBottom: '3px solid var(--theme-primary)', color: 'var(--theme-surface-readable)' }
          : { color: 'var(--theme-surface-readable-muted)' }
      }
    >
      {children}
    </button>
  );
}
