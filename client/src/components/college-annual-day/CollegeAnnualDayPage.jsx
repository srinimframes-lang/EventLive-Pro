import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/college-annual-day.css';
import LivePlayer from '../live/LivePlayer.jsx';
import ViewerCount from '../live/ViewerCount.jsx';
import StreamingDetailsBox from '../live/StreamingDetailsBox.jsx';
import BannerSlot from '../BannerSlot.jsx';
import ShareButtons from '../ShareButtons.jsx';
import PhotographyStudio from '../PhotographyStudio.jsx';
import EventSeo from '../seo/EventSeo.jsx';
import { resolveMediaUrl } from '../../utils/format.js';
import { formatWeddingDate, formatWeddingTime } from '../../utils/weddingTemplates.js';
import { resolveCollegeAnnualDayContent } from '../../utils/collegeAnnualDay.js';

const LiveChat = lazy(() => import('../live/LiveChat.jsx'));
const QAPanel = lazy(() => import('../live/QAPanel.jsx'));
const PhotoGallery = lazy(() => import('../PhotoGallery.jsx'));

function PanelFallback() {
  return <p className="p-6 text-center text-sm" style={{ color: 'var(--cad-muted)' }}>Loading…</p>;
}

function liveStatusLabel({ displayIsLive, isRecordedReplay }) {
  if (displayIsLive) return { text: 'Live', className: 'is-live' };
  if (isRecordedReplay) return { text: 'Replay', className: 'is-replay' };
  return { text: 'Upcoming', className: 'is-upcoming' };
}

/**
 * Premium College Annual Day public watch page.
 * Opt-in via event.pageTemplate === 'college-annual-day'.
 * Reuses the existing LivePlayer / gallery / chat architecture.
 */
export default function CollegeAnnualDayPage({
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
  const content = useMemo(() => resolveCollegeAnnualDayContent(event), [event]);
  const logoSrc = resolveMediaUrl(content.collegeLogo);
  const bannerSrc = resolveMediaUrl(content.banner);
  const dateLabel = formatWeddingDate(event.startTime);
  const timeLabel = formatWeddingTime(event.startTime);
  const status = liveStatusLabel({
    displayIsLive: displayIsLive ?? mergedConfig?.isLive,
    isRecordedReplay,
  });
  const initials = (content.collegeName || content.title || 'AD')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <EventSeo event={event} pageType="watch" />
      <div className="college-annual-day" data-kind={content.kind}>
        <header className="cad-header">
          <div className="cad-header-inner">
            {logoSrc ? (
              <img className="cad-logo" src={logoSrc} alt={content.collegeName || 'College logo'} />
            ) : (
              <div className="cad-logo-fallback" aria-hidden>{initials}</div>
            )}
            <div>
              <p className="cad-kicker">{content.kicker}</p>
              <h1 className="cad-college-name">{content.collegeName || content.fallbackCollege}</h1>
            </div>
          </div>
        </header>

        <section className="cad-hero" aria-label={content.fallbackTitle}>
          {bannerSrc ? (
            <img
              src={bannerSrc}
              alt=""
              className="cad-hero-bg"
              fetchPriority="high"
              decoding="async"
            />
          ) : (
            <div className="cad-hero-fallback" aria-hidden />
          )}
          <div className="cad-hero-overlay" aria-hidden />
          <div className="cad-hero-inner">
            {content.academicYear ? <p className="cad-year">{content.academicYear}</p> : null}
            <h2 className="cad-title">{content.title || content.fallbackTitle}</h2>
            {content.tagline ? <p className="cad-tagline">{content.tagline}</p> : null}
            <div className="cad-meta">
              {dateLabel ? <span>{dateLabel}</span> : null}
              {timeLabel ? <span>{timeLabel}</span> : null}
              {content.heroPlace ? <span>{content.heroPlace}</span> : null}
            </div>
            <div className={`cad-status ${status.className}`}>
              <span className="cad-status-dot" aria-hidden />
              {status.text}
            </div>
          </div>
        </section>

        {content.hasSections ? (
          <section className="cad-section" aria-label="Programme">
            <div className="cad-section-head">
              <div>
                <h2 className="cad-section-title">Programme</h2>
                <div className="cad-rule" aria-hidden />
              </div>
            </div>
            <div className="cad-program-grid">
              {content.sections.map((section) => (
                <article key={section.id} className="cad-program-card">
                  <h3>{section.label}</h3>
                  {section.note ? <p>{section.note}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {content.hasChiefGuest ? (
          <section className="cad-section" aria-label="Chief guest">
            <div className="cad-section-head">
              <div>
                <h2 className="cad-section-title">Chief Guest</h2>
                <div className="cad-rule" aria-hidden />
              </div>
            </div>
            <div className="cad-guest-card">
              <p className="cad-guest-label">Honouring</p>
              <p className="cad-guest-name">{content.chiefGuestName}</p>
              {content.chiefGuestDesignation ? (
                <p className="cad-guest-role">{content.chiefGuestDesignation}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section id="watch-player" className="cad-section">
          <div className="cad-section-head">
            <div>
              <h2 className="cad-section-title">Live Stream</h2>
              <div className="cad-rule" aria-hidden />
            </div>
            <ViewerCount
              count={room.viewers}
              isLive={displayIsLive ?? mergedConfig?.isLive}
              isRecorded={isRecordedReplay}
              recordedLabel="Replay"
            />
          </div>
          <div className="cad-player-frame">
            <LivePlayer
              key={room.playerNonce}
              config={mergedConfig}
              onLiveUiChange={onLiveUiChange}
            />
          </div>
          <BannerSlot location="live_player" className="mt-3" />
          <div className="cad-share-row">
            <ShareButtons url={watchUrl} title={content.title || content.collegeName} />
            {canAnswer && (
              <Link to={`/events/${event.id}/studio`} className="cad-studio-link">
                Open streaming studio
              </Link>
            )}
          </div>
        </section>

        <section className="cad-section" aria-label="Photo gallery">
          <BannerSlot location="gallery" className="mb-4" />
          <div className="cad-section-head">
            <div>
              <h2 className="cad-section-title">Gallery</h2>
              <div className="cad-rule" aria-hidden />
            </div>
            <span className="text-sm" style={{ color: 'var(--cad-muted)' }}>
              {event.gallery?.length || 0} photos
            </span>
          </div>
          <Suspense fallback={<PanelFallback />}>
            {event.gallery?.length ? (
              <PhotoGallery photos={event.gallery} event={event} />
            ) : (
              <p className="cad-empty">Photos will appear here when the host uploads a gallery.</p>
            )}
          </Suspense>
        </section>

        {content.hasInfo ? (
          <section className="cad-section" aria-label="Event information">
            <div className="cad-section-head">
              <div>
                <h2 className="cad-section-title">Event Information</h2>
                <div className="cad-rule" aria-hidden />
              </div>
            </div>
            <div className="cad-info-grid">
              <div className="cad-info-card">
                <p>
                  {content.description ||
                    `${content.title || content.fallbackTitle} at ${content.collegeName || 'the college'}.`}
                </p>
              </div>
              <div className="cad-info-card cad-facts">
                {content.academicYear ? (
                  <div className="cad-fact">
                    <dt>Year</dt>
                    <dd>{content.academicYear}</dd>
                  </div>
                ) : null}
                {content.venue ? (
                  <div className="cad-fact">
                    <dt>Venue</dt>
                    <dd>{content.venue}</dd>
                  </div>
                ) : null}
                {content.principalName ? (
                  <div className="cad-fact">
                    <dt>Principal</dt>
                    <dd>{content.principalName}</dd>
                  </div>
                ) : null}
                {content.collegeAddress && content.collegeAddress !== content.venue ? (
                  <div className="cad-fact">
                    <dt>College address</dt>
                    <dd>{content.collegeAddress}</dd>
                  </div>
                ) : null}
                {content.contact ? (
                  <div className="cad-fact">
                    <dt>Contact</dt>
                    <dd>{content.contact}</dd>
                  </div>
                ) : null}
                {dateLabel || timeLabel ? (
                  <div className="cad-fact">
                    <dt>Date & time</dt>
                    <dd>{[dateLabel, timeLabel].filter(Boolean).join(' · ')}</dd>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section className="cad-section" aria-label="Live chat and questions">
          <div className="cad-chat-card">
            <div className="cad-chat-tabs">
              {chatOn && (
                <button
                  type="button"
                  className={`cad-chat-tab ${currentTab === 'chat' ? 'is-active' : ''}`}
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
                className={`cad-chat-tab ${currentTab === 'qa' ? 'is-active' : ''}`}
                onClick={() => {
                  setLocalTab('qa');
                  setTab?.('qa');
                }}
              >
                Q&amp;A {room.questions.length > 0 ? `(${room.questions.length})` : ''}
              </button>
            </div>
            <div className="cad-chat-body">
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

        <footer className="cad-footer">
          <p className="cad-footer-names">{content.collegeName || content.title}</p>
          {content.title && content.collegeName ? <p className="cad-footer-meta">{content.title}</p> : null}
          {content.contact ? <p className="cad-footer-meta">{content.contact}</p> : null}
          {dateLabel || timeLabel ? (
            <p className="cad-footer-meta">{[dateLabel, timeLabel].filter(Boolean).join(' · ')}</p>
          ) : null}
        </footer>
      </div>
    </>
  );
}
