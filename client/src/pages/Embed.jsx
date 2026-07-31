import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { eventService } from '../services/event.service.js';
import { streamService } from '../services/stream.service.js';
import { useLiveRoom } from '../hooks/useLiveRoom.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { ensureSafeEventTheme } from '../utils/eventTheme.js';
import { resolveMediaUrl } from '../utils/format.js';
import LivePlayer from '../components/live/LivePlayer.jsx';
import FailoverToast from '../components/live/FailoverToast.jsx';
import { livePollIntervalMs, mergeLivePriorityConfig } from '../utils/livePriority.js';

/**
 * Minimal embeddable player — video only (no chrome, chat, gallery, ads).
 * Route: /embed/:shortCode
 * Shows a small EventLivePro mark unless white-label Disable Branding is on
 * (or an active custom domain is attached to the organizer).
 */
export default function Embed() {
  const { shortCode } = useParams();
  const { settings } = useSettings();
  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    setEvent(null);
    setConfig(null);
    if (!shortCode) {
      setError('Missing event code');
      return undefined;
    }
    eventService
      .get(shortCode)
      .then(async (ev) => {
        if (!active) return;
        setEvent(ensureSafeEventTheme(ev));
        const cfg = await streamService.getConfig(ev.id).catch(() => null);
        if (active) setConfig(cfg);
      })
      .catch((err) => active && setError(err.message || 'Event not found'));
    return () => {
      active = false;
    };
  }, [shortCode]);

  const eventId = event?.id;
  const room = useLiveRoom(eventId, { guestName: 'Guest' });

  const streamProvider = config?.provider;
  const pollIsLive = Boolean(config?.isLive);
  const pollRecordingKey = config?.recordingUrl
    ? '1'
    : Array.isArray(config?.recordings) && config.recordings.length > 0
      ? String(config.recordings.length)
      : '';
  useEffect(() => {
    if (!eventId || !streamProvider) return undefined;
    const isServer = streamProvider === 'rtmp' || streamProvider === 'hls';
    if (!isServer) return undefined;
    const intervalMs = livePollIntervalMs(
      {
        isLive: pollIsLive,
        recordingUrl: pollRecordingKey ? '1' : '',
        recordings: pollRecordingKey ? [{}] : [],
      },
      { socketConnected: room.connected }
    );
    const timer = setInterval(async () => {
      const cfg = await streamService.getConfig(eventId).catch(() => null);
      if (cfg) setConfig((prev) => (prev ? { ...prev, ...cfg } : cfg));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [eventId, streamProvider, room.connected, pollIsLive, pollRecordingKey]);

  const mergedConfig = useMemo(
    () => mergeLivePriorityConfig(config, room.liveStatus, room.failoverState),
    [config, room.liveStatus, room.failoverState]
  );

  const title = useMemo(() => {
    if (!event) return '';
    if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
    return event.brideName || event.groomName || event.title || '';
  }, [event]);

  const hidePlatformLogo = Boolean(event?.embedHidePlatformLogo);
  const platformLogo = resolveMediaUrl(settings?.companyLogo || '');
  const platformName = settings?.companyName || 'EventLive Pro';

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center text-white">
        <p className="text-sm text-white/80">{error}</p>
      </div>
    );
  }

  if (!event || !mergedConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-white/70">
        Loading stream…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-neutral-950 text-white">
      <FailoverToast
        message={room.failoverNotice}
        visible={Boolean(room.failoverNotice)}
        onDismiss={room.clearFailoverNotice}
      />
      {title ? (
        <div className="shrink-0 truncate px-3 py-2 text-center text-sm font-medium text-white/90 sm:text-base">
          {title}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <LivePlayer key={room.playerNonce} config={mergedConfig} />
        </div>
        {!hidePlatformLogo ? (
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white/85 backdrop-blur-sm sm:text-xs">
            {platformLogo ? (
              <img
                src={platformLogo}
                alt=""
                className="h-4 w-4 rounded object-contain"
                width={16}
                height={16}
              />
            ) : null}
            <span>{platformName}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
