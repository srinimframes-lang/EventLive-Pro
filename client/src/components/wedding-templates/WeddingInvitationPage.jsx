import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LivePlayer from '../live/LivePlayer.jsx';
import ViewerCount from '../live/ViewerCount.jsx';
import StreamingDetailsBox from '../live/StreamingDetailsBox.jsx';
import BannerSlot from '../BannerSlot.jsx';
import ShareButtons from '../ShareButtons.jsx';
import PhotographyStudio from '../PhotographyStudio.jsx';
import EventSeo from '../seo/EventSeo.jsx';
import { formatDateTime, resolveMediaUrl, whatsappLink } from '../../utils/format.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { getWeddingTemplateMeta } from './registry.js';
import './wedding-templates.css';

const LiveChat = lazy(() => import('../live/LiveChat.jsx'));
const QAPanel = lazy(() => import('../live/QAPanel.jsx'));
const PhotoGallery = lazy(() => import('../PhotoGallery.jsx'));

function PanelFallback() {
  return <p className="p-6 text-center text-sm opacity-70">Loading…</p>;
}

/**
 * Shared invitation-style wedding watch page.
 * Visuals are driven by `templateId` CSS variant + ornament asset.
 * Live player / chat / gallery / streaming details are unchanged shared components.
 */
export default function WeddingInvitationPage({
  templateId,
  event,
  coupleTitle,
  watchUrl,
  mergedConfig,
  room,
  chatOn,
  activeTab,
  setTab,
  canAnswer,
  isRecordedReplay,
}) {
  const meta = getWeddingTemplateMeta(templateId);
  const { settings } = useSettings();
  const [tab, setLocalTab] = useState(activeTab || 'chat');

  const bride = (event.brideName || '').trim();
  const groom = (event.groomName || '').trim();
  const welcome = (event.description || '').trim();
  const heroSrc = resolveMediaUrl(event.heroBackgroundImage || event.coverImage || '');
  const coupleSrc = resolveMediaUrl(event.coverImage || '');
  const brideSrc = resolveMediaUrl(event.bridePhoto || '');
  const groomSrc = resolveMediaUrl(event.groomPhoto || '');

  const dateLabel = useMemo(() => {
    if (!event.startTime) return '';
    const d = new Date(event.startTime);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [event.startTime]);

  const timeLabel = useMemo(() => {
    if (!event.startTime) return '';
    const d = new Date(event.startTime);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, [event.startTime]);

  const waNumber = (event.studioWhatsapp || settings?.whatsappNumber || '').trim();
  const waHref = whatsappLink(
    waNumber,
    `Hi! I'm watching ${coupleTitle || event.title} live on EventLive Pro.`
  );

  const currentTab = chatOn ? tab : 'qa';
  const variantClass = `wt-page wt-${meta.id}`;

  return (
    <>
      <EventSeo event={event} pageType="watch" />
      <div className={variantClass}>
        <header className="wt-hero">
          {heroSrc ? (
            <img
              src={heroSrc}
              alt=""
              className="wt-hero-bg"
              fetchPriority="high"
              decoding="async"
            />
          ) : (
            <div className="wt-hero-bg wt-hero-fallback" aria-hidden />
          )}
          <div className="wt-hero-overlay" aria-hidden />
          {meta.ornament && (
            <img src={meta.ornament} alt="" className="wt-hero-ornament" aria-hidden />
          )}
          <div className="wt-hero-inner">
            <p className="wt-eyebrow">{meta.label}</p>
            <h1 className="wt-names">
              {bride || 'Bride'}
              <span className="wt-amp">&amp;</span>
              {groom || 'Groom'}
            </h1>
            <div className="wt-meta">
              {dateLabel && <span>{dateLabel}</span>}
              {timeLabel && <span>{timeLabel}</span>}
              {event.venue && <span>{event.venue}</span>}
            </div>
            <a href="#watch-player" className="wt-watch-btn">
              <span className="wt-watch-dot" aria-hidden />
              Watch Live
            </a>
          </div>
        </header>

        <section className="wt-section wt-couple" aria-label="The couple">
          {meta.ornament && (
            <img src={meta.ornament} alt="" className="wt-section-ornament" aria-hidden />
          )}
          <h2 className="wt-section-title">
            {bride || 'Bride'}
            <span className="wt-amp-inline">&amp;</span>
            {groom || 'Groom'}
          </h2>
          {(coupleSrc || brideSrc || groomSrc) && (
            <div
              className={`wt-couple-photos ${
                brideSrc && groomSrc ? 'wt-couple-photos-trio' : 'wt-couple-photos-single'
              }`}
            >
              {brideSrc && (
                <figure className="wt-portrait">
                  <img src={brideSrc} alt={bride || 'Bride'} loading="lazy" decoding="async" />
                  {bride && <figcaption>{bride}</figcaption>}
                </figure>
              )}
              {coupleSrc && (
                <figure className="wt-portrait wt-portrait-main">
                  <img
                    src={coupleSrc}
                    alt={coupleTitle || 'The couple'}
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              )}
              {groomSrc && (
                <figure className="wt-portrait">
                  <img src={groomSrc} alt={groom || 'Groom'} loading="lazy" decoding="async" />
                  {groom && <figcaption>{groom}</figcaption>}
                </figure>
              )}
            </div>
          )}
          {welcome && <p className="wt-welcome">{welcome}</p>}
        </section>

        <section id="watch-player" className="wt-section wt-player-section">
          <div className="wt-section-head">
            <h2 className="wt-section-title">Live Ceremony</h2>
            <ViewerCount
              count={room.viewers}
              isLive={mergedConfig?.isLive}
              isRecorded={isRecordedReplay}
            />
          </div>
          <div className="wt-player-frame">
            <LivePlayer key={room.playerNonce} config={mergedConfig} />
          </div>
          <BannerSlot location="live_player" className="mt-3" />
          <div className="wt-share-row">
            <ShareButtons url={watchUrl} title={coupleTitle || event.title} />
            {canAnswer && (
              <Link to={`/events/${event.id}/studio`} className="wt-studio-link">
                Open streaming studio
              </Link>
            )}
          </div>
        </section>

        <section className="wt-section wt-gallery-section" aria-label="Photo gallery">
          <BannerSlot location="gallery" className="mb-4" />
          <div className="wt-section-head">
            <h2 className="wt-section-title">Photo Gallery</h2>
            <span className="wt-count">{event.gallery?.length || 0} photos</span>
          </div>
          <Suspense fallback={<PanelFallback />}>
            {event.gallery?.length ? (
              <PhotoGallery photos={event.gallery} event={event} />
            ) : (
              <p className="wt-empty">Photos will appear here when the host uploads a gallery.</p>
            )}
          </Suspense>
        </section>

        <section className="wt-section wt-chat-section" aria-label="Live chat and questions">
          <div className="wt-chat-card">
            <div className="wt-chat-tabs">
              {chatOn && (
                <button
                  type="button"
                  className={`wt-chat-tab ${currentTab === 'chat' ? 'is-active' : ''}`}
                  onClick={() => {
                    setLocalTab('chat');
                    setTab?.('chat');
                  }}
                >
                  Chat
                </button>
              )}
              <button
                type="button"
                className={`wt-chat-tab ${currentTab === 'qa' ? 'is-active' : ''}`}
                onClick={() => {
                  setLocalTab('qa');
                  setTab?.('qa');
                }}
              >
                Q&amp;A {room.questions.length > 0 ? `(${room.questions.length})` : ''}
              </button>
            </div>
            <div className="wt-chat-body">
              <Suspense fallback={<PanelFallback />}>
                {currentTab === 'chat' ? (
                  <LiveChat
                    messages={room.messages}
                    onSend={room.sendMessage}
                    disabled={!room.connected}
                  />
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
              </Suspense>
            </div>
          </div>
        </section>

        <PhotographyStudio event={event} />

        <StreamingDetailsBox event={event} streamConfig={mergedConfig} variant="classic" />

        <footer className="wt-footer">
          <p className="wt-footer-names">{coupleTitle || event.title}</p>
          {event.venue && <p className="wt-footer-meta">{event.venue}</p>}
          {event.startTime && (
            <p className="wt-footer-meta">{formatDateTime(event.startTime)}</p>
          )}
        </footer>

        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="wt-wa-float"
            aria-label="Chat on WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </a>
        )}
      </div>
    </>
  );
}
