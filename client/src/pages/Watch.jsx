import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { streamService } from '../services/stream.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLiveRoom } from '../hooks/useLiveRoom.js';
import { buildWatchUrl, formatDateTime, resolveMediaUrl, watchPath } from '../utils/format.js';
import { hasEventTheme, ensureSafeEventTheme } from '../utils/eventTheme.js';
import LivePlayer from '../components/live/LivePlayer.jsx';
import LiveChat from '../components/live/LiveChat.jsx';
import QAPanel from '../components/live/QAPanel.jsx';
import ViewerCount from '../components/live/ViewerCount.jsx';
import PhotoGallery from '../components/PhotoGallery.jsx';
import ShareButtons from '../components/ShareButtons.jsx';
import ThemedWatchLayout from '../components/ThemedWatchLayout.jsx';
import ThemeLoadingScreen from '../components/theme/ThemeLoadingScreen.jsx';

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
  const guestName = user?.name || 'Guest';
  const room = useLiveRoom(eventId, { guestName });

  const mergedConfig = useMemo(() => {
    if (!config) return null;
    if (!room.liveStatus) return config;
    return { ...config, isLive: room.liveStatus.isLive };
  }, [config, room.liveStatus]);

  const canAnswer = useMemo(() => user?.role === 'admin', [user]);

  const coupleTitle = useMemo(() => {
    if (!event) return '';
    if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
    return event.brideName || event.groomName || '';
  }, [event]);

  const themed = hasEventTheme(event);

  useEffect(() => {
    if (!event) return undefined;
    const prev = document.title;
    document.title = `${coupleTitle || event.title} · Live`;
    return () => {
      document.title = prev;
    };
  }, [event, coupleTitle]);

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
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/events/${event.slug || event.id}`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Event details
        </Link>
        {event.photographerName && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {event.photographerLogo && (
              <img
                src={resolveMediaUrl(event.photographerLogo)}
                alt={event.photographerName}
                className="h-8 w-8 rounded-md object-contain"
              />
            )}
            <span>
              Captured by <span className="font-semibold text-slate-700">{event.photographerName}</span>
            </span>
          </div>
        )}
      </div>

      {coupleTitle && (
        <div className="relative mt-3 overflow-hidden rounded-2xl text-center text-white shadow-lg">
          {event.coverImage && (
            <img
              src={resolveMediaUrl(event.coverImage)}
              alt={coupleTitle}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div
            className={`relative px-4 py-8 sm:py-12 ${
              event.coverImage
                ? 'bg-gradient-to-t from-black/80 via-black/40 to-black/30'
                : 'bg-gradient-to-r from-brand-600 to-brand-800'
            }`}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-brand-100">
              {event.category === 'concert' ? 'Live' : 'Wedding Live'}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-extrabold drop-shadow sm:text-5xl">
              {coupleTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-brand-50/90">
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{event.title}</h2>
            <ViewerCount count={room.viewers} isLive={mergedConfig?.isLive} />
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

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Photo gallery</h2>
          <span className="text-sm text-slate-500">{event.gallery?.length || 0} photos</span>
        </div>
        <PhotoGallery photos={event.gallery || []} />
      </section>
    </div>
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
