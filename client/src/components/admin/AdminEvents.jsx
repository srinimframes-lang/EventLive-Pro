import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventService } from '../../services/event.service.js';
import { streamService } from '../../services/stream.service.js';
import api from '../../services/api.js';
import EventQrCard from '../EventQrCard.jsx';
import EventGalleryManager from './EventGalleryManager.jsx';
import { formatDateTime, buildWatchUrl } from '../../utils/format.js';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [expandedQrId, setExpandedQrId] = useState(null);
  const [expandedStreamId, setExpandedStreamId] = useState(null);
  const [expandedGalleryId, setExpandedGalleryId] = useState(null);
  const [galleryByEvent, setGalleryByEvent] = useState({});
  const [galleryLoadingId, setGalleryLoadingId] = useState(null);
  const [streamInfo, setStreamInfo] = useState({});
  const [recordingMeta, setRecordingMeta] = useState({});
  const [streamLoadingId, setStreamLoadingId] = useState(null);
  const [recordingBusyId, setRecordingBusyId] = useState(null);

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
    setStreamLoadingId(ev.id);
    try {
      const [key, meta] = await Promise.all([
        streamInfo[ev.id] ? Promise.resolve(streamInfo[ev.id]) : streamService.getKey(ev.id),
        streamService.getRecordingMeta(ev.id).catch(() => null),
      ]);
      setStreamInfo((prev) => ({ ...prev, [ev.id]: key }));
      if (meta) setRecordingMeta((prev) => ({ ...prev, [ev.id]: meta }));
    } catch (e) {
      setError(e.message);
    } finally {
      setStreamLoadingId(null);
    }
  };

  const refreshRecordingMeta = async (ev) => {
    const meta = await streamService.getRecordingMeta(ev.id).catch(() => null);
    if (meta) setRecordingMeta((prev) => ({ ...prev, [ev.id]: meta }));
    return meta;
  };

  const runRecordingAction = async (ev, action, part = null) => {
    setRecordingBusyId(ev.id);
    setError('');
    try {
      if (action === 'hide') await streamService.hideRecording(ev.id);
      if (action === 'restore') await streamService.restoreRecording(ev.id);
      if (action === 'play') {
        const info = await streamService.resolveRecordingPlayUrl(ev.id, part?.id || '');
        if (info?.url) window.open(info.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (action === 'download') {
        const res = await api.get(streamService.recordingDownloadUrl(ev.id, part?.id || ''), {
          responseType: 'blob',
        });
        const filename =
          part?.filename ||
          recordingMeta[ev.id]?.recordingFilename ||
          `recording-${ev.id}.mp4`;
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      if (action === 'delete-part') {
        if (
          !window.confirm(
            `Permanently delete Part ${part?.part} (${part?.filename || 'recording'})? Other parts are kept.`
          )
        ) {
          return;
        }
        await streamService.deleteRecording(ev.id, { partId: part.id });
      }
      if (action === 'delete-all') {
        if (
          !window.confirm(
            `Permanently delete ALL ${recordingMeta[ev.id]?.recordingCount || ''} recording parts for "${ev.title}"? This cannot be undone.`
          )
        ) {
          return;
        }
        await streamService.deleteRecording(ev.id, { all: true });
      }
      await refreshRecordingMeta(ev);
    } catch (e) {
      setError(e.message);
    } finally {
      setRecordingBusyId(null);
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

  const toggleGallery = async (ev) => {
    if (expandedGalleryId === ev.id) {
      setExpandedGalleryId(null);
      return;
    }
    setExpandedGalleryId(ev.id);
    if (galleryByEvent[ev.id]) return;
    setGalleryLoadingId(ev.id);
    try {
      const full = await eventService.get(ev.id);
      setGalleryByEvent((prev) => ({ ...prev, [ev.id]: full.gallery || [] }));
    } catch (e) {
      setError(e.message);
    } finally {
      setGalleryLoadingId(null);
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
            const rec = recordingMeta[ev.id];
            const showRecordedBadge =
              rec?.hasRecording && !rec.recordingHidden && !rec.recordingExpired;
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
                      ev.isLive
                        ? 'bg-red-100 text-red-700'
                        : showRecordedBadge
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ev.isLive ? 'LIVE' : showRecordedBadge ? 'RECORDED' : ev.status}
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
                  <button type="button" className="btn-outline" onClick={() => toggleGallery(ev)}>
                    {expandedGalleryId === ev.id ? 'Hide gallery' : 'Gallery'}
                  </button>
                  <Link to={`/events/${ev.id}/studio`} className="btn-outline">
                    Studio
                  </Link>
                  <Link to={`/events/${ev.id}/edit`} className="btn-outline">
                    Edit
                  </Link>
                  <a href={liveLink(ev)} target="_blank" rel="noreferrer" className="btn-outline">
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
                {expandedGalleryId === ev.id && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {galleryLoadingId === ev.id ? (
                      <p className="text-sm text-slate-500">Loading gallery…</p>
                    ) : (
                      <EventGalleryManager
                        eventId={ev.id}
                        photos={galleryByEvent[ev.id] || []}
                        onChange={(next) =>
                          setGalleryByEvent((prev) => ({ ...prev, [ev.id]: next }))
                        }
                        onError={setError}
                      />
                    )}
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
                          label="OBS Server URL"
                          value={streamInfo[ev.id].ingestUrl}
                          copied={copiedId === `${ev.id}-rtmp`}
                          onCopy={() => copyText(streamInfo[ev.id].ingestUrl, ev.id, 'rtmp')}
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

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-800">Recorded replay</p>
                      {!rec?.hasRecording ? (
                        <p className="mt-1 text-xs text-slate-500">
                          No recording on file yet. An MP4 is saved automatically when the live stream
                          ends.
                        </p>
                      ) : (
                        <>
                          <p className="mt-1 text-xs text-slate-600">
                            {rec.recordingCount > 1
                              ? `${rec.recordingCount} parts`
                              : `File: ${rec.recordingFilename}`}
                            {rec.recordingPublicUntil && (
                              <> · Public until {formatDateTime(rec.recordingPublicUntil)}</>
                            )}
                            {rec.recordingHidden && ' · Hidden by admin'}
                            {rec.recordingExpired && !rec.recordingHidden && ' · Expired (hidden from public)'}
                          </p>
                          <div className="mt-2 space-y-2">
                            {(rec.parts || []).map((part) => (
                              <div
                                key={part.id || part.part}
                                className="rounded-md border border-slate-200 bg-white px-2 py-2"
                              >
                                <p className="text-xs font-medium text-slate-800">
                                  Part {part.part}
                                  {part.durationSec
                                    ? ` · ${Math.round(part.durationSec / 60)}m ${part.durationSec % 60}s`
                                    : ''}
                                </p>
                                <p className="break-all text-[11px] text-slate-500">{part.filename}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="btn-outline text-xs"
                                    disabled={recordingBusyId === ev.id}
                                    onClick={() => runRecordingAction(ev, 'play', part)}
                                  >
                                    Play
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-outline text-xs"
                                    disabled={recordingBusyId === ev.id}
                                    onClick={() => runRecordingAction(ev, 'download', part)}
                                  >
                                    Download
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-outline text-xs text-red-600"
                                    disabled={recordingBusyId === ev.id}
                                    onClick={() => runRecordingAction(ev, 'delete-part', part)}
                                  >
                                    Delete part
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {rec.recordingHidden || rec.recordingExpired ? (
                              <button
                                type="button"
                                className="btn-outline text-xs"
                                disabled={recordingBusyId === ev.id}
                                onClick={() => runRecordingAction(ev, 'restore')}
                              >
                                Restore all (public)
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-outline text-xs"
                                disabled={recordingBusyId === ev.id}
                                onClick={() => runRecordingAction(ev, 'hide')}
                              >
                                Hide all (public)
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-outline text-xs text-red-600"
                              disabled={recordingBusyId === ev.id}
                              onClick={() => runRecordingAction(ev, 'delete-all')}
                            >
                              Delete all permanently
                            </button>
                          </div>
                        </>
                      )}
                    </div>
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
