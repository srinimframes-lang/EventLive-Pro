import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService } from '../../services/event.service.js';
import { streamService } from '../../services/stream.service.js';
import EventQrCard from '../EventQrCard.jsx';
import { formatDateTime, buildWatchUrl } from '../../utils/format.js';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [expandedQrId, setExpandedQrId] = useState(null);
  const [expandedStreamId, setExpandedStreamId] = useState(null);
  const [streamInfo, setStreamInfo] = useState({});
  const [streamLoadingId, setStreamLoadingId] = useState(null);

  const load = () => {
    setLoading(true);
    eventService
      .list({ limit: 50 })
      .then((res) => setEvents(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const liveLink = (ev) => buildWatchUrl(ev, window.location.origin);

  const copyLink = async (ev) => {
    try {
      await navigator.clipboard.writeText(liveLink(ev));
      setCopiedId(ev.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt('Copy this live link:', liveLink(ev));
    }
  };

  const remove = async (ev) => {
    if (!window.confirm(`Delete event "${ev.title}"? This cannot be undone.`)) return;
    try {
      await eventService.remove(ev.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const isServerEvent = (ev) =>
    ev.streamProvider === 'rtmp' ||
    ev.streamProvider === 'hls' ||
    ev.creditType === 'server';

  const toggleStreamInfo = async (ev) => {
    if (expandedStreamId === ev.id) {
      setExpandedStreamId(null);
      return;
    }
    setExpandedStreamId(ev.id);
    if (streamInfo[ev.id]) return;
    setStreamLoadingId(ev.id);
    try {
      const key = await streamService.getKey(ev.id);
      setStreamInfo((prev) => ({ ...prev, [ev.id]: key }));
    } catch (e) {
      setError(e.message);
    } finally {
      setStreamLoadingId(null);
    }
  };

  const copyText = async (text, id, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${id}-${field}`);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt('Copy:', text);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Events</h2>
        <Link to="/events/new" className="btn-primary">
          + Create event
        </Link>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-slate-600">No events yet. Approve a booking or create one.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const couple =
              ev.brideName && ev.groomName ? `${ev.brideName} & ${ev.groomName}` : null;
            return (
              <div key={ev.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{ev.title}</p>
                    {couple && <p className="text-sm text-slate-500">{couple}</p>}
                    <p className="text-sm text-slate-500">
                      {ev.organizer?.name ? `${ev.organizer.name} · ` : ''}
                      {formatDateTime(ev.startTime)}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">{liveLink(ev)}</p>
                  </div>
                  <span
                    className={`badge ${
                      ev.isLive ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ev.isLive ? 'LIVE' : ev.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={() => copyLink(ev)}>
                    {copiedId === ev.id ? 'Copied!' : 'Copy live link'}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setExpandedQrId(expandedQrId === ev.id ? null : ev.id)}
                  >
                    {expandedQrId === ev.id ? 'Hide QR' : 'QR code'}
                  </button>
                  {isServerEvent(ev) && (
                    <button type="button" className="btn-outline" onClick={() => toggleStreamInfo(ev)}>
                      {expandedStreamId === ev.id ? 'Hide stream' : 'Stream setup'}
                    </button>
                  )}
                  <Link to={`/events/${ev.id}/studio`} className="btn-outline">
                    Studio
                  </Link>
                  <Link to={`/events/${ev.id}/edit`} className="btn-outline">
                    Edit
                  </Link>
                  <a
                    href={liveLink(ev)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-outline"
                  >
                    Watch
                  </a>
                  <button type="button" className="btn-outline text-red-600" onClick={() => remove(ev)}>
                    Delete
                  </button>
                </div>
                {expandedQrId === ev.id && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <EventQrCard event={ev} className="!shadow-none !p-0 border-0" />
                  </div>
                )}
                {expandedStreamId === ev.id && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <p className="text-sm font-semibold text-slate-800">MediaMTX stream credentials</p>
                    {streamLoadingId === ev.id && (
                      <p className="text-sm text-slate-500">Loading stream credentials…</p>
                    )}
                    {streamInfo[ev.id] && (
                      <div className="space-y-2 text-sm">
                        <StreamField
                          label="RTMP URL"
                          value={streamInfo[ev.id].fullUrl}
                          copied={copiedId === `${ev.id}-rtmp`}
                          onCopy={() => copyText(streamInfo[ev.id].fullUrl, ev.id, 'rtmp')}
                        />
                        <StreamField
                          label="Stream Key"
                          value={streamInfo[ev.id].streamKey}
                          copied={copiedId === `${ev.id}-key`}
                          onCopy={() => copyText(streamInfo[ev.id].streamKey, ev.id, 'key')}
                        />
                        <StreamField
                          label="HLS Player URL"
                          value={streamInfo[ev.id].playbackUrl}
                          copied={copiedId === `${ev.id}-hls`}
                          onCopy={() => copyText(streamInfo[ev.id].playbackUrl, ev.id, 'hls')}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StreamField({ label, value, copied, onCopy }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs text-slate-800">{value}</code>
        <button type="button" className="btn-outline text-xs" onClick={onCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
