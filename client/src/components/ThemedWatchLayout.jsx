import { useEffect } from 'react';
import { formatDateTime, resolveMediaUrl } from '../utils/format.js';
import {
  googleFontsHref,
  themeStyleVars,
} from '../utils/eventTheme.js';
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
  const isDarkSurface = (snap.colors?.surface || '').toLowerCase().includes('1c') ||
    (snap.colors?.surface || '').toLowerCase().includes('0f');

  const goldBorder = Boolean(style.goldBorder);

  return (
    <div
      className={`themed-watch relative min-h-screen overflow-x-hidden ${goldBorder ? 'themed-watch-regional' : ''}`}
      style={{
        ...vars,
        fontFamily: 'var(--theme-font-body)',
        backgroundColor: 'var(--theme-surface)',
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
              color-mix(in srgb, var(--theme-gradient-from) 70%, transparent) 0%,
              color-mix(in srgb, var(--theme-secondary) 50%, transparent) 40%,
              color-mix(in srgb, var(--theme-footer-bg) 85%, transparent) 100%)`,
          }}
        />
        <div className="theme-bg-shimmer" aria-hidden />
      </div>

      {/* Hero */}
      <header className="theme-hero relative overflow-hidden text-[var(--theme-hero-text)]">
        <ThemeEffects
          particleStyle={style.particleStyle || 'bokeh'}
          gradientFrom={style.gradientFrom}
          gradientTo={style.gradientTo}
        />
        <ThemeDecor iconSet={style.iconSet} decoration={style.decoration} />
        <ThemeGoldBorder enabled={goldBorder} className="relative">
        <div className="theme-animate-fade-up px-4 py-12 sm:py-20" style={{ minHeight: 'min(48vh, 460px)' }}>
        <div className="mx-auto max-w-4xl text-center">
            {couplePhoto && (
              <img
                src={couplePhoto}
                alt={title}
                className="theme-couple-photo mx-auto mb-5 h-24 w-24 rounded-full border-4 object-cover shadow-2xl sm:h-32 sm:w-32"
                style={{ borderColor: 'var(--theme-accent)' }}
              />
            )}
            {event.photographerName && (
              <GlassCard className="mx-auto mb-5 inline-flex items-center gap-2 px-4 py-2 text-sm" dark>
                {event.photographerLogo && (
                  <img
                    src={resolveMediaUrl(event.photographerLogo)}
                    alt=""
                    className="h-8 w-8 rounded-md object-contain"
                  />
                )}
                <span>Captured by {event.photographerName}</span>
              </GlassCard>
            )}
            <p
              className="theme-hero-label text-xs uppercase tracking-[0.4em] sm:text-sm"
              style={{ color: 'var(--theme-accent)' }}
            >
              {heroLabel}
            </p>
            <h1
              className="theme-hero-title mt-3 text-3xl font-extrabold drop-shadow-lg sm:text-5xl md:text-6xl"
              style={{ fontFamily: 'var(--theme-font-heading)' }}
            >
              {title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm opacity-95">
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
              className="mt-8 gap-2 px-10 py-3.5 text-sm sm:text-base"
            >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>
                Watch Live
              </PremiumButton>
          </div>
        </div>
        </ThemeGoldBorder>
      </header>

      <ThemeMusicToggle musicUrl={style.backgroundMusic} />

      <main className="relative mx-auto max-w-7xl px-3 py-8 sm:px-4">
        <div id="watch-player" className="grid gap-6 lg:grid-cols-3">
          <div className="theme-animate-fade-up theme-animate-delay-1 lg:col-span-2">
            <GlassCard className="overflow-hidden p-0" dark={isDarkSurface}>
              <LivePlayer key={playerNonce} config={mergedConfig} />
            </GlassCard>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-xl font-bold sm:text-2xl"
                style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-secondary)' }}
              >
                {event.title}
              </h2>
              <ViewerCount count={room?.viewers || 0} isLive={mergedConfig?.isLive} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ShareButtons url={watchUrl} title={title} />
            </div>
            {event.description && (
              <GlassCard className="mt-4 text-sm leading-relaxed opacity-90" dark={isDarkSurface}>
                <p className="whitespace-pre-wrap">{event.description}</p>
              </GlassCard>
            )}
          </div>

          <div className="theme-animate-fade-up theme-animate-delay-2 lg:col-span-1">
            <GlassCard className="flex h-[60vh] flex-col overflow-hidden p-0 sm:h-[70vh]" dark={isDarkSurface}>
              <div className="flex border-b border-white/10">
                {chatOn && (
                  <ThemedTab active={activeTab === 'chat'} onClick={() => setTab('chat')}>
                    Chat
                  </ThemedTab>
                )}
                <ThemedTab active={activeTab === 'qa'} onClick={() => setTab('qa')}>
                  Q&amp;A {(room?.questions?.length || 0) > 0 && `(${room.questions.length})`}
                </ThemedTab>
              </div>
              <div className="min-h-0 flex-1 bg-white/95">
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
          <GlassCard className="mb-4 flex items-center justify-between" dark={isDarkSurface}>
            <h2
              className="text-xl font-bold sm:text-2xl"
              style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-secondary)' }}
            >
              Photo Gallery
            </h2>
            <span className="text-sm opacity-70">{event.gallery?.length || 0} photos</span>
          </GlassCard>
          <PhotoGallery photos={event.gallery || []} />
        </section>
      </main>

      <footer
        className="theme-footer relative mt-10 px-4 py-10 text-center text-sm"
        style={{
          backgroundColor: 'var(--theme-footer-bg)',
          color: 'var(--theme-footer-text)',
        }}
      >
        <p style={{ fontFamily: 'var(--theme-font-heading)' }} className="text-lg font-semibold">
          {title}
        </p>
        {snap.footerText && <p className="mt-2 opacity-80">{snap.footerText}</p>}
        {event.venue && <p className="mt-1 opacity-70">{event.venue}</p>}
      </footer>
    </div>
  );
}

function ThemedTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-4 py-3 text-sm font-semibold transition"
      style={
        active
          ? { borderBottom: '2px solid var(--theme-primary)', color: 'var(--theme-primary)' }
          : { color: 'inherit', opacity: 0.65 }
      }
    >
      {children}
    </button>
  );
}
