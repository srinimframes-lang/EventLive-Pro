import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/wedding-templates.css';
import LivePlayer from '../live/LivePlayer.jsx';
import ViewerCount from '../live/ViewerCount.jsx';
import StreamingDetailsBox from '../live/StreamingDetailsBox.jsx';
import BannerSlot from '../BannerSlot.jsx';
import ShareButtons from '../ShareButtons.jsx';
import PhotographyStudio from '../PhotographyStudio.jsx';
import EventSeo from '../seo/EventSeo.jsx';
import { DEFAULT_WEDDING_CARD_TEMPLATE, eventTypeCopy, formatWeddingDate, formatWeddingTime, isWeddingPageTemplate, normalizeEventCategory } from '../../utils/weddingTemplates.js';
import WeddingHero from './WeddingHero.jsx';
import CeremonyHero from './CeremonyHero.jsx';

const LiveChat = lazy(() => import('../live/LiveChat.jsx'));
const QAPanel = lazy(() => import('../live/QAPanel.jsx'));
const PhotoGallery = lazy(() => import('../PhotoGallery.jsx'));

function PanelFallback() {
  return <p className="p-6 text-center text-sm" style={{ color: 'var(--wt-muted)' }}>Loading…</p>;
}

/**
 * Premium wedding live page. Template art is decorative only.
 * Invitation images are never shown here — including uploaded-card events
 * and manual wedding entries (which have no cover image).
 */
export default function WeddingTemplatePage({
  event,
  templateId = DEFAULT_WEDDING_CARD_TEMPLATE,
  coupleTitle,
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
  const eventType = normalizeEventCategory(event?.category) || 'wedding';
  const useWeddingHero = isWeddingPageTemplate(templateId) || eventType === 'wedding';
  const copy = eventTypeCopy(useWeddingHero ? 'wedding' : eventType);

  return (
    <>
      <EventSeo event={event} pageType="watch" />
      <div className="wedding-template" data-template={templateId}>
        {useWeddingHero ? <WeddingHero event={event} /> : <CeremonyHero event={event} />}

        <section id="watch-player" className="wt-section">
          <div className="wt-section-head">
            <h2 className="wt-section-title">{copy.player}</h2>
            <ViewerCount
              count={room.viewers}
              isLive={displayIsLive ?? mergedConfig?.isLive}
              isRecorded={isRecordedReplay}
            />
          </div>
          <div className="wt-player-frame">
            <LivePlayer
              key={room.playerNonce}
              config={mergedConfig}
              onLiveUiChange={onLiveUiChange}
            />
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

        <section className="wt-section" aria-label="Photo gallery">
          <BannerSlot location="gallery" className="mb-4" />
          <div className="wt-section-head">
            <h2 className="wt-section-title">Photo Gallery</h2>
            <span className="text-sm" style={{ color: 'var(--wt-muted)' }}>
              {event.gallery?.length || 0} photos
            </span>
          </div>
          <Suspense fallback={<PanelFallback />}>
            {event.gallery?.length ? (
              <PhotoGallery photos={event.gallery} event={event} />
            ) : (
              <p className="wt-empty">Photos will appear here when the host uploads a gallery.</p>
            )}
          </Suspense>
        </section>

        <section className="wt-section" aria-label="Live chat and questions">
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
        <StreamingDetailsBox event={event} streamConfig={mergedConfig} />

        <footer className="wt-footer">
          <p className="wt-footer-names">{coupleTitle || event.title}</p>
          {event.venue ? <p className="wt-footer-meta">{event.venue}</p> : null}
          {event.startTime ? (
            <p className="wt-footer-meta">
              {[formatWeddingDate(event.startTime), formatWeddingTime(event.startTime)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </footer>
      </div>
    </>
  );
}
