import { formatDateTime, resolveMediaUrl } from '../../utils/format.js';
import LivePlayer from '../live/LivePlayer.jsx';
import LiveChat from '../live/LiveChat.jsx';
import QAPanel from '../live/QAPanel.jsx';
import ViewerCount from '../live/ViewerCount.jsx';
import ShareButtons from '../ShareButtons.jsx';
import PhotographyStudio from '../PhotographyStudio.jsx';
import BannerSlot from '../BannerSlot.jsx';
import PremiumButton from './PremiumButton.jsx';
import GlassCard from './GlassCard.jsx';
import ThemeEffects from './ThemeEffects.jsx';
import ThemeDecor from './ThemeDecor.jsx';
import ThemeGoldBorder from './ThemeGoldBorder.jsx';
import ThemedGallery from './layouts/ThemedGallery.jsx';

export function WatchLiveButton({ style, heroRead, className = '' }) {
  return (
    <PremiumButton
      as="a"
      href="#watch-player"
      buttonStyle={style.buttonStyle || 'pill-glow'}
      heroIsDark={heroRead.isDark}
      className={`gap-2 px-8 py-3 text-base font-extrabold sm:text-lg ${className}`}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      Watch Live
    </PremiumButton>
  );
}

export function WatchMeta({ event, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold sm:text-base ${className}`}>
      {event.startTime && <span>{formatDateTime(event.startTime)}</span>}
      {event.venue && (
        <span className="flex items-center gap-1.5">
          <span aria-hidden>📍</span>
          {event.venue}
        </span>
      )}
    </div>
  );
}

export function WatchPlayerBlock({ mergedConfig, playerNonce, surfaceDark, className = '', bare = false }) {
  const player = <LivePlayer key={playerNonce} config={mergedConfig} />;
  const ad = <BannerSlot location="live_player" className="mt-3" />;
  if (bare) {
    return (
      <div className={className}>
        {player}
        {ad}
      </div>
    );
  }
  return (
    <>
      <GlassCard className={`overflow-hidden p-0 ${className}`} dark={surfaceDark} solid>
        {player}
      </GlassCard>
      {ad}
    </>
  );
}

export function WatchChatBlock({
  chatOn,
  activeTab,
  setTab,
  room,
  canAnswer,
  surfaceDark,
  className = '',
}) {
  return (
    <GlassCard className={`flex flex-col overflow-hidden p-0 ${className}`} dark={surfaceDark} solid>
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
            disabled={!room?.connected}
          />
        )}
      </div>
    </GlassCard>
  );
}

export function WatchPlayerHeader({ event, title, watchUrl, mergedConfig, room }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <h2
        className="text-lg font-extrabold sm:text-2xl"
        style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-surface-readable)' }}
      >
        {event.title}
      </h2>
      <ViewerCount count={room?.viewers || 0} isLive={mergedConfig?.isLive} />
      <ShareButtons url={watchUrl} title={title} />
    </div>
  );
}

export function WatchDescription({ event, surfaceDark, className = '' }) {
  if (!event.description) return null;
  return (
    <GlassCard className={`mt-4 text-base font-medium leading-relaxed ${className}`} dark={surfaceDark} solid>
      <p className="whitespace-pre-wrap">{event.description}</p>
    </GlassCard>
  );
}

export function WatchGallerySection({ event, surfaceDark, galleryVariant }) {
  return (
    <section className="mt-10 sm:mt-12">
      <BannerSlot location="gallery" className="mb-4" />
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="text-xl font-extrabold sm:text-2xl"
          style={{ fontFamily: 'var(--theme-font-heading)', color: 'var(--theme-surface-readable)' }}
        >
          Photo Gallery
        </h2>
        <span className="text-sm font-semibold" style={{ color: 'var(--theme-surface-readable-muted)' }}>
          {event.gallery?.length || 0} photos
        </span>
      </div>
      <ThemedGallery photos={event.gallery || []} variant={galleryVariant} event={event} />
    </section>
  );
}

export function WatchFooter({ snap, title, event, className = '' }) {
  return (
    <footer
      className={`layout-footer relative z-10 px-4 py-10 text-center ${className}`}
      style={{
        backgroundColor: 'var(--theme-footer-bg)',
        color: 'var(--theme-footer-readable)',
      }}
    >
      <BannerSlot location="footer" className="mb-6" />
      <p style={{ fontFamily: 'var(--theme-font-heading)' }} className="text-xl font-extrabold sm:text-2xl">
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
  );
}

export function HeroEffects({ style }) {
  return (
    <>
      <ThemeEffects
        particleStyle={style.particleStyle || 'bokeh'}
        gradientFrom={style.gradientFrom}
        gradientTo={style.gradientTo}
      />
      <ThemeDecor iconSet={style.iconSet} decoration={style.decoration} />
    </>
  );
}

export function CouplePhoto({ src, title, className = '' }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={title}
      className={`object-cover ${className}`}
      loading="eager"
      decoding="async"
    />
  );
}

export function PhotographerBadge({ event }) {
  if (!event.photographerLogo && !event.photographerName) return null;
  return (
    <GlassCard className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold sm:text-sm" solid>
      {event.photographerLogo && (
        <img
          src={resolveMediaUrl(event.photographerLogo)}
          alt={event.photographerName ? `${event.photographerName} logo` : 'Photographer logo'}
          className="h-7 w-7 rounded-md object-contain"
        />
      )}
      {event.photographerName && <span>Captured by {event.photographerName}</span>}
    </GlassCard>
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
