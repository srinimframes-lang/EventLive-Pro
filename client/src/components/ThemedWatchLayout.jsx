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
  // Always use the theme's background — never let coverImage replace the template design.
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

  return (
    <div
      className="themed-watch min-h-screen"
      style={{
        ...vars,
        fontFamily: 'var(--theme-font-body)',
        backgroundColor: 'var(--theme-surface)',
      }}
    >
      {/* Hero — theme background + primary tint (unique per template) */}
      <header className="relative overflow-hidden text-[var(--theme-hero-text)]">
        {themeBg && (
          <img src={themeBg} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, var(--theme-footer-bg) 0%, color-mix(in srgb, var(--theme-primary) 55%, transparent) 45%, color-mix(in srgb, var(--theme-secondary) 35%, transparent) 100%)`,
          }}
          aria-hidden
        />
        <div
          className="relative px-4 py-10 sm:py-16"
          style={{ minHeight: 'min(42vh, 420px)' }}
        >
          <div className="mx-auto max-w-4xl text-center">
            {couplePhoto && (
              <img
                src={couplePhoto}
                alt={title}
                className="mx-auto mb-4 h-24 w-24 rounded-full border-4 object-cover shadow-xl sm:h-28 sm:w-28"
                style={{ borderColor: 'var(--theme-accent)' }}
              />
            )}
            {event.photographerName && (
              <div className="mb-4 flex items-center justify-center gap-2 text-sm opacity-90">
                {event.photographerLogo && (
                  <img
                    src={resolveMediaUrl(event.photographerLogo)}
                    alt=""
                    className="h-8 w-8 rounded-md object-contain bg-white/10"
                  />
                )}
                <span>Captured by {event.photographerName}</span>
              </div>
            )}
            <p
              className="text-xs uppercase tracking-[0.35em] opacity-90"
              style={{ color: 'var(--theme-accent)' }}
            >
              {heroLabel}
            </p>
            <h1
              className="mt-2 text-3xl font-extrabold drop-shadow sm:text-5xl md:text-6xl"
              style={{ fontFamily: 'var(--theme-font-heading)' }}
            >
              {title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm opacity-95">
              {event.startTime && <span>{formatDateTime(event.startTime)}</span>}
              {event.venue && (
                <span className="flex items-center gap-1">
                  <span aria-hidden>📍</span>
                  {event.venue}
                </span>
              )}
            </div>
            <a
              href="#watch-player"
              className="mt-6 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Watch Live
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-4">
        <div id="watch-player" className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/5">
              <LivePlayer key={playerNonce} config={mergedConfig} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-xl font-bold sm:text-2xl"
                style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-secondary)' }}
              >
                {event.title}
              </h2>
              <ViewerCount count={room.viewers} isLive={mergedConfig?.isLive} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ShareButtons url={watchUrl} title={title} />
            </div>
            {event.description && (
              <p className="mt-4 whitespace-pre-wrap text-slate-600">{event.description}</p>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="flex h-[60vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 sm:h-[70vh]">
              <div className="flex border-b border-slate-200">
                {chatOn && (
                  <ThemedTab active={activeTab === 'chat'} onClick={() => setTab('chat')}>
                    Chat
                  </ThemedTab>
                )}
                <ThemedTab active={activeTab === 'qa'} onClick={() => setTab('qa')}>
                  Q&amp;A {room.questions.length > 0 && `(${room.questions.length})`}
                </ThemedTab>
              </div>
              <div className="min-h-0 flex-1">
                {activeTab === 'chat' ? (
                  <LiveChat messages={room.messages} onSend={room.sendMessage} disabled={!room.connected} />
                ) : (
                  <QAPanel
                    questions={room.questions}
                    onAsk={room.askQuestion}
                    onUpvote={room.upvoteQuestion}
                    onAnswer={room.answerQuestion}
                    canAnswer={canAnswer}
                    disabled={!room.connected}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Gallery */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-xl font-bold sm:text-2xl"
              style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-secondary)' }}
            >
              Photo Gallery
            </h2>
            <span className="text-sm text-slate-500">{event.gallery?.length || 0} photos</span>
          </div>
          <PhotoGallery photos={event.gallery || []} />
        </section>
      </main>

      {/* Footer */}
      <footer
        className="mt-8 px-4 py-8 text-center text-sm"
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
          : { color: '#64748b' }
      }
    >
      {children}
    </button>
  );
}
