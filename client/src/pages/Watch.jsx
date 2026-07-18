import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { streamService } from '../services/stream.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLiveRoom } from '../hooks/useLiveRoom.js';
import { buildWatchUrl, formatDateTime, resolveMediaUrl, watchPath } from '../utils/format.js';
import { hasEventTheme, ensureSafeEventTheme, publicEventTypeLabel } from '../utils/eventTheme.js';
import LivePlayer from '../components/live/LivePlayer.jsx';
import LiveChat from '../components/live/LiveChat.jsx';
import QAPanel from '../components/live/QAPanel.jsx';
import ViewerCount from '../components/live/ViewerCount.jsx';
import PhotoGallery from '../components/PhotoGallery.jsx';
import BannerSlot from '../components/BannerSlot.jsx';
import ShareButtons from '../components/ShareButtons.jsx';
import PhotographyStudio from '../components/PhotographyStudio.jsx';
import ThemedWatchLayout from '../components/ThemedWatchLayout.jsx';
import ThemeLoadingScreen from '../components/theme/ThemeLoadingScreen.jsx';
import EventSeo from '../components/seo/EventSeo.jsx';

export default function Watch() {
  const { idOrSlug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('chat');

  useEffect(() => {
    let active = true;
    setError('');
    eventService
      .get(idOrSlug)
      .then(async (ev) => {
        if (!active) return;
        const canonical = watchPath(ev);
        if (ev.shortCode && canonical && window.location.pathname !== canonical) {
          navigate(canonical, { replace: true });
          return;
        }
        setEvent(ensureSafeEventTheme(ev));
        const cfg = await streamService.getConfig(ev.id).catch(() => null);
        if (active) setConfig(cfg);
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [idOrSlug, navigate]);

  const eventId = event?.id;

  // Poll MediaMTX-backed stream status while watching a Premium Server event.
  useEffect(() => {
    if (!eventId || !config) return undefined;
    const isServer = config.provider === 'rtmp' || config.provider === 'hls';
    if (!isServer) return undefined;
    const timer = setInterval(async () => {
      const cfg = await streamService.getConfig(eventId).catch(() => null);
      if (cfg) {
        setConfig((prev) => (prev ? { ...prev, ...cfg } : cfg));
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [eventId, config?.provider]);

  const guestName = user?.name || 'Guest';
  const room = useLiveRoom(eventId, { guestName });

  const mergedConfig = useMemo(() => {
    if (!config) return null;
    if (!room.liveStatus) return config;
    const next = {
      ...config,
      isLive: room.liveStatus.isLive,
    };
    if (room.liveStatus.recordingUrl !== undefined) {
      next.recordingUrl = room.liveStatus.recordingUrl || '';
      next.recordingAvailable = Boolean(room.liveStatus.recordingAvailable);
      next.playbackMode =
        room.liveStatus.playbackMode ||
        (room.liveStatus.isLive ? 'live' : room.liveStatus.recordingUrl ? 'recorded' : 'offline');
    }
    return next;
  }, [config, room.liveStatus]);

  const isRecordedReplay = Boolean(
    mergedConfig &&
      !mergedConfig.isLive &&
      (mergedConfig.playbackMode === 'recorded' || mergedConfig.recordingUrl)
  );

  const canAnswer = useMemo(() => user?.role === 'admin', [user]);

  const coupleTitle = useMemo(() => {
    if (!event) return '';
    if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
    return event.brideName || event.groomName || '';
  }, [event]);

  const themed = hasEventTheme(event);

  useEffect(() => {
    if (!themed) return undefined;
    document.body.classList.add('watch-themed');
    return () => document.body.classList.remove('watch-themed');
  }, [themed]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        <Link to="/events" className="btn-ghost mt-4">Back to events</Link>
      </div>
    );

  if (!event) return <ThemeLoadingScreen label="Loading event…" />;

  const watchUrl = buildWatchUrl(event);
  const chatOn = event.chatEnabled !== false;
  const activeTab = chatOn ? tab : 'qa';

  if (themed) {
    return (
      <>
        <EventSeo event={event} pageType="watch" />
        <ThemedWatchLayout
        event={event}
        coupleTitle={coupleTitle}
        watchUrl={watchUrl}
        mergedConfig={mergedConfig}
        room={room}
        chatOn={chatOn}
        activeTab={activeTab}
        setTab={setTab}
        canAnswer={canAnswer}
        playerNonce={room.playerNonce}
      />
      </>
    );
  }

  return (
    <>
      <EventSeo event={event} pageType="watch" />
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/events/${event.slug || event.id}`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Event details
        </Link>
        {event.photographerName && (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            {event.photographerLogo && (
              <img
                src={resolveMediaUrl(event.photographerLogo)}
                alt={event.photographerName}
                className="h-8 w-8 rounded-md object-contain"
              />
            )}
            <span>
              Captured by <span className="font-extrabold">{event.photographerName}</span>
            </span>
          </div>
        )}
      </div>

      {(coupleTitle || event.coverImage) && (
        <div className="relative mt-3 overflow-hidden rounded-2xl text-center shadow-lg">
          {event.coverImage && (
            <img
              src={resolveMediaUrl(event.coverImage)}
              alt={coupleTitle || event.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div
            className={`relative px-4 py-10 sm:py-14 ${
              event.coverImage
                ? 'bg-black/60'
                : 'bg-gradient-to-r from-brand-600 to-brand-800'
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/90">
              {publicEventTypeLabel(event.themeSnapshot?.category || event.category)}
            </p>
            <h1 className="mt-2 text-[2rem] font-extrabold leading-tight text-white sm:text-5xl">
              {coupleTitle || event.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-base font-bold text-white/90">
              {event.startTime && <span>{formatDateTime(event.startTime)}</span>}
              {event.venue && (
                <span className="flex items-center gap-1">
                  <span aria-hidden>📍</span>
                  {event.venue}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LivePlayer key={room.playerNonce} config={mergedConfig} />
          <BannerSlot location="live_player" className="mt-3" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{event.title}</h2>
            <ViewerCount
              count={room.viewers}
              isLive={mergedConfig?.isLive}
              isRecorded={isRecordedReplay}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ShareButtons url={watchUrl} title={coupleTitle || event.title} />
            {canAnswer && (
              <Link to={`/events/${event.id}/studio`} className="btn-ghost">
                Open streaming studio
              </Link>
            )}
          </div>
          {event.description && (
            <p className="mt-4 whitespace-pre-wrap text-slate-600">{event.description}</p>
          )}
          <section className="mt-8">
            <BannerSlot location="gallery" className="mb-4" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Photo gallery</h2>
              <span className="text-sm text-slate-500">{event.gallery?.length || 0} photos</span>
            </div>
            {event.gallery?.length ? (
              <PhotoGallery photos={event.gallery} event={event} />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Photos will appear here when the host uploads a gallery.
              </p>
            )}
          </section>
        </div>
        <div className="lg:col-span-1">
          <div className="card flex h-[60vh] flex-col p-0 sm:h-[70vh]">
            <div className="flex border-b border-slate-200">
              {chatOn && (
                <TabButton active={activeTab === 'chat'} onClick={() => setTab('chat')}>
                  Chat
                </TabButton>
              )}
              <TabButton active={activeTab === 'qa'} onClick={() => setTab('qa')}>
                Q&amp;A {room.questions.length > 0 && `(${room.questions.length})`}
              </TabButton>
            </div>
            <div className="min-h-0 flex-1">
              {activeTab === 'chat' ? (
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
            </div>
          </div>
        </div>
      </div>

      <PhotographyStudio event={event} />
    </div>
    </>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
        active ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
