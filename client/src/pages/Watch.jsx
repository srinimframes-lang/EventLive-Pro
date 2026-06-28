import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { streamService } from '../services/stream.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLiveRoom } from '../hooks/useLiveRoom.js';
import LivePlayer from '../components/live/LivePlayer.jsx';
import LiveChat from '../components/live/LiveChat.jsx';
import QAPanel from '../components/live/QAPanel.jsx';
import ViewerCount from '../components/live/ViewerCount.jsx';

export default function Watch() {
  const { idOrSlug } = useParams();
  const { user } = useAuth();

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
        setEvent(ev);
        const cfg = await streamService.getConfig(ev.id).catch(() => null);
        if (active) setConfig(cfg);
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [idOrSlug]);

  const eventId = event?.id;
  const guestName = user?.name || 'Guest';
  const room = useLiveRoom(eventId, { guestName });

  // Merge live status pushed over the socket into the player config.
  const mergedConfig = useMemo(() => {
    if (!config) return null;
    if (!room.liveStatus) return config;
    return { ...config, isLive: room.liveStatus.isLive };
  }, [config, room.liveStatus]);

  const canAnswer = useMemo(() => {
    if (!event || !user) return false;
    const organizerId = event.organizer?.id || event.organizer?._id;
    return user.role === 'admin' || organizerId === user.id;
  }, [event, user]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        <Link to="/events" className="btn-ghost mt-4">Back to events</Link>
      </div>
    );

  if (!event) return <p className="py-20 text-center text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to={`/events/${event.slug || event.id}`} className="text-sm text-brand-600 hover:underline">
        ← Event details
      </Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        {/* Player + meta */}
        <div className="lg:col-span-2">
          <LivePlayer config={mergedConfig} />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{event.title}</h1>
            <ViewerCount count={room.viewers} isLive={mergedConfig?.isLive} />
          </div>

          {canAnswer && (
            <Link to={`/events/${event.id}/studio`} className="btn-ghost mt-3 inline-flex">
              Open streaming studio
            </Link>
          )}

          <p className="mt-3 whitespace-pre-wrap text-slate-600">{event.description}</p>
        </div>

        {/* Realtime sidebar */}
        <div className="lg:col-span-1">
          <div className="card flex h-[70vh] flex-col p-0">
            <div className="flex border-b border-slate-200">
              <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
                Chat
              </TabButton>
              <TabButton active={tab === 'qa'} onClick={() => setTab('qa')}>
                Q&amp;A {room.questions.length > 0 && `(${room.questions.length})`}
              </TabButton>
            </div>
            <div className="min-h-0 flex-1">
              {tab === 'chat' ? (
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
