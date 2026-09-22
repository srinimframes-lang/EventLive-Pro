import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/event-templates.css';
import LivePlayer from '../live/LivePlayer.jsx';
import ViewerCount from '../live/ViewerCount.jsx';
import StreamingDetailsBox from '../live/StreamingDetailsBox.jsx';
import BannerSlot from '../BannerSlot.jsx';
import ShareButtons from '../ShareButtons.jsx';
import PhotographyStudio from '../PhotographyStudio.jsx';
import EventSeo from '../seo/EventSeo.jsx';
import { resolveMediaUrl } from '../../utils/format.js';
import { formatWeddingDate, formatWeddingTime } from '../../utils/weddingTemplates.js';
import { resolveEventTemplateContent } from '../../utils/eventTemplates.js';

const LiveChat = lazy(() => import('../live/LiveChat.jsx'));
const QAPanel = lazy(() => import('../live/QAPanel.jsx'));
const PhotoGallery = lazy(() => import('../PhotoGallery.jsx'));

function PanelFallback() {
  return <p className="p-6 text-center text-sm" style={{ color: 'var(--et-muted)' }}>Loading…</p>;
}

function liveStatusLabel({ displayIsLive, isRecordedReplay }) {
  if (displayIsLive) return { text: 'Live', className: 'is-live' };
  if (isRecordedReplay) return { text: 'Replay', className: 'is-replay' };
  return { text: 'Upcoming', className: 'is-upcoming' };
}

/**
 * Shared public page for additive event templates.
 * Opt-in via event.pageTemplate. Does not replace wedding/reception/college pages.
 */
export default function EventTemplatePage({
  event,
  watchUrl,
  mergedConfig,
  room,
  chatOn,
  activeTab,
  setTab,
  canAnswer,
  isRecordedReplay,
  onLiveUiChange,
  displayIsLive,
}) {
  const [tab, setLocalTab] = useState(activeTab || 'chat');
  const currentTab = chatOn ? tab : 'qa';
  const content = useMemo(() => resolveEventTemplateContent(event), [event]);
  const logoSrc = resolveMediaUrl(content.logo);
  const bannerSrc = resolveMediaUrl(content.banner);
  const photoSrc = resolveMediaUrl(content.photo);
  const extraSrc = resolveMediaUrl(content.extraPhoto);
  const dateLabel = formatWeddingDate(event.startTime);
  const timeLabel = formatWeddingTime(event.startTime);
  const status = liveStatusLabel({
    displayIsLive: displayIsLive ?? mergedConfig?.isLive,
    isRecordedReplay,
  });
  const initials = (content.orgName || content.headline || 'EL')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const playerHeading = isRecordedReplay ? 'Replay' : content.playerTitle;

  return (
    <>
      <EventSeo event={event} pageType="watch" />
      <div className="event-template" data-template={content.templateId}>
        <header className="et-header">
          <div className="et-header-inner">
            {logoSrc ? (
              <img className="et-logo" src={logoSrc} alt={content.orgName || 'Event logo'} />
            ) : photoSrc && !bannerSrc ? (
              <img className="et-logo et-logo-photo" src={photoSrc} alt="" />
            ) : (
              <div className="et-logo-fallback" aria-hidden>{initials}</div>
            )}
            <div>
              <p className="et-kicker">{content.kicker}</p>
              <h1 className="et-org-name">{content.orgName || content.headline}</h1>
            </div>
          </div>
        </header>

        <section className="et-hero" aria-label={content.kicker}>
          {bannerSrc ? (
            <img src={bannerSrc} alt="" className="et-hero-bg" fetchPriority="high" decoding="async" />
          ) : (
            <div className="et-hero-fallback" aria-hidden />
          )}
          <div className="et-hero-overlay" aria-hidden />
          <div className="et-hero-inner">
            {photoSrc ? (
              <img className="et-hero-portrait" src={photoSrc} alt={content.headline} />
            ) : null}
            {content.subtitle ? <p className="et-year">{content.subtitle}</p> : null}
            <h2 className="et-title">{content.headline || event.title}</h2>
            {content.coupleNames && content.coupleNames !== content.headline ? (
              <p className="et-tagline">{content.coupleNames}</p>
            ) : null}
            <div className="et-meta">
              {dateLabel ? <span>{dateLabel}</span> : null}
              {timeLabel ? <span>{timeLabel}</span> : null}
              {content.venue ? <span>{content.venue}</span> : null}
            </div>
            <div className={`et-status ${status.className}`}>
              <span className="et-status-dot" aria-hidden />
              {status.text}
            </div>
          </div>
        </section>

        {content.hasFamily ? (
          <section className="et-section" aria-label={content.familyTitle}>
            <div className="et-section-head">
              <div>
                <h2 className="et-section-title">{content.familyTitle}</h2>
                <div className="et-rule" aria-hidden />
              </div>
            </div>
            <div className="et-info-card">
              <p>{content.familyBlock}</p>
            </div>
          </section>
        ) : null}

        {content.hasBlessing ? (
          <section className="et-section" aria-label={content.blessingTitle}>
            <div className="et-section-head">
              <div>
                <h2 className="et-section-title">{content.blessingTitle}</h2>
                <div className="et-rule" aria-hidden />
              </div>
            </div>
            <div className="et-info-card et-blessing">
              <p>{content.blessing}</p>
            </div>
          </section>
        ) : null}

        {content.hasExtraPhoto ? (
          <section className="et-section" aria-label="Photos">
            <div className="et-photo-row">
              {extraSrc ? <img src={extraSrc} alt="" className="et-side-photo" /> : null}
            </div>
          </section>
        ) : null}

        {content.hasSections ? (
          <section className="et-section" aria-label="Programme">
            <div className="et-section-head">
              <div>
                <h2 className="et-section-title">Programme</h2>
                <div className="et-rule" aria-hidden />
              </div>
            </div>
            <div className="et-program-grid">
              {content.sections.map((section) => (
                <article key={section.id} className="et-program-card">
                  <h3>{section.label}</h3>
                  {section.note ? <p>{section.note}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {content.hasScoreboard ? (
          <section className="et-section" aria-label="Scoreboard">
            <div className="et-section-head">
              <div>
                <h2 className="et-section-title">Scoreboard</h2>
                <div className="et-rule" aria-hidden />
              </div>
            </div>
            <div className="et-score-grid">
              {content.scoreboard.liveScore ? (
                <article className="et-score-card">
                  <h3>Live Score</h3>
                  <p>{content.scoreboard.liveScore}</p>
                </article>
              ) : null}
              {content.scoreboard.matchResults ? (
                <article className="et-score-card">
                  <h3>Results</h3>
                  <p className="et-pre">{content.scoreboard.matchResults}</p>
                </article>
              ) : null}
              {content.scoreboard.pointsTable ? (
                <article className="et-score-card">
                  <h3>Points Table</h3>
                  <p className="et-pre">{content.scoreboard.pointsTable}</p>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        <section id="watch-player" className="et-section">
          <div className="et-section-head">
            <div>
              <h2 className="et-section-title">{playerHeading}</h2>
              <div className="et-rule" aria-hidden />
            </div>
            <ViewerCount
              count={room.viewers}
              isLive={displayIsLive ?? mergedConfig?.isLive}
              isRecorded={isRecordedReplay}
              recordedLabel="Replay"
            />
          </div>
          <div className="et-player-frame">
            <LivePlayer
              key={room.playerNonce}
              config={mergedConfig}
              onLiveUiChange={onLiveUiChange}
            />
          </div>
          <BannerSlot location="live_player" className="mt-3" />
          <div className="et-share-row">
            <ShareButtons url={watchUrl} title={content.headline || content.orgName} />
            {canAnswer && (
              <Link to={`/events/${event.id}/studio`} className="et-studio-link">
                Open streaming studio
              </Link>
            )}
          </div>
        </section>

        <section className="et-section" aria-label="Photo gallery">
          <BannerSlot location="gallery" className="mb-4" />
          <div className="et-section-head">
            <div>
              <h2 className="et-section-title">Gallery</h2>
              <div className="et-rule" aria-hidden />
            </div>
            <span className="text-sm" style={{ color: 'var(--et-muted)' }}>
              {event.gallery?.length || 0} photos
            </span>
          </div>
          <Suspense fallback={<PanelFallback />}>
            {event.gallery?.length ? (
              <PhotoGallery photos={event.gallery} event={event} />
            ) : (
              <p className="et-empty">Photos will appear here when the host uploads a gallery.</p>
            )}
          </Suspense>
        </section>

        {content.hasInfo ? (
          <section className="et-section" aria-label="Event information">
            <div className="et-section-head">
              <div>
                <h2 className="et-section-title">Event Information</h2>
                <div className="et-rule" aria-hidden />
              </div>
            </div>
            <div className="et-info-grid">
              <div className="et-info-card">
                <p>
                  {content.description ||
                    content.scheduleNote ||
                    `${content.headline || event.title} live on EventLivePro.`}
                </p>
                {content.scheduleNote && content.description ? (
                  <p className="et-pre et-schedule">{content.scheduleNote}</p>
                ) : null}
              </div>
              <div className="et-info-card et-facts">
                {content.facts.map((fact) => (
                  <div className="et-fact" key={`${fact.label}-${fact.value}`}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
                {dateLabel || timeLabel ? (
                  <div className="et-fact">
                    <dt>Date & time</dt>
                    <dd>{[dateLabel, timeLabel].filter(Boolean).join(' · ')}</dd>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section className="et-section" aria-label="Live chat and questions">
          <div className="et-chat-card">
            <div className="et-chat-tabs">
              {chatOn && (
                <button
                  type="button"
                  className={`et-chat-tab ${currentTab === 'chat' ? 'is-active' : ''}`}
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
                className={`et-chat-tab ${currentTab === 'qa' ? 'is-active' : ''}`}
                onClick={() => {
                  setLocalTab('qa');
                  setTab?.('qa');
                }}
              >
                Q&amp;A {room.questions.length > 0 ? `(${room.questions.length})` : ''}
              </button>
            </div>
            <div className="et-chat-body">
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
        <StreamingDetailsBox event={event} streamConfig={mergedConfig} />

        <footer className="et-footer">
          <p className="et-footer-names">{content.orgName || content.headline}</p>
          {content.headline && content.orgName && content.headline !== content.orgName ? (
            <p className="et-footer-meta">{content.headline}</p>
          ) : null}
          {content.contact ? <p className="et-footer-meta">{content.contact}</p> : null}
          {content.venue ? <p className="et-footer-meta">{content.venue}</p> : null}
          {dateLabel || timeLabel ? (
            <p className="et-footer-meta">{[dateLabel, timeLabel].filter(Boolean).join(' · ')}</p>
          ) : null}
        </footer>

        {content.whatsappHref ? (
          <a
            href={content.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="et-wa-float"
            aria-label="Chat on WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </a>
        ) : null}
      </div>
    </>
  );
}
