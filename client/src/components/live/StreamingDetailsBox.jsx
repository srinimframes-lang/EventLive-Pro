import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { streamService } from '../../services/stream.service.js';

function canManageEvent(event, user) {
  if (!event || !user) return false;
  if (user.role === 'admin') return true;
  const organizerId = event.organizer?.id || event.organizer?._id || event.organizer;
  const userId = user.id || user._id;
  return Boolean(organizerId && userId && String(organizerId) === String(userId));
}

function isPremiumServerEvent(event, streamConfig) {
  const provider = streamConfig?.provider || event?.streamProvider;
  return provider === 'rtmp' || provider === 'hls';
}

/**
 * OBS ingest details for the logged-in event owner/admin only.
 * Fetches Server URL + Stream Key from the protected /stream/key API —
 * never from the public Watch payload.
 */
export default function StreamingDetailsBox({ event, streamConfig, variant = 'default' }) {
  const { user } = useAuth();
  const allowed = useMemo(
    () => canManageEvent(event, user) && isPremiumServerEvent(event, streamConfig),
    [event, user, streamConfig]
  );

  const [creds, setCreds] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!allowed || !event?.id) return undefined;
    let active = true;
    setError('');
    streamService
      .getKey(event.id)
      .then((data) => {
        if (active) setCreds(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load streaming details');
      });
    return () => {
      active = false;
    };
  }, [allowed, event?.id]);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(''), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  if (!allowed) return null;

  const ingestUrl = creds?.ingestUrl || '';
  const streamKey = creds?.streamKey || '';

  const copyText = async (text, which) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      setError('Copy failed — select the text manually');
    }
  };

  const copyBoth = async () => {
    if (!ingestUrl || !streamKey) return;
    const block = `Server / RTMP URL:\n${ingestUrl}\n\nStream Key:\n${streamKey}`;
    try {
      await navigator.clipboard.writeText(block);
      setCopied('both');
    } catch {
      setError('Copy failed — select the text manually');
    }
  };

  return (
    <section
      className={`streaming-details ${variant === 'classic' ? 'streaming-details--classic' : ''}`}
      aria-label="Streaming details for OBS"
    >
      <div className="streaming-details__head">
        <h2 className="streaming-details__title">Streaming Details</h2>
        {copied ? (
          <span className="streaming-details__copied" role="status" aria-live="polite">
            Copied
          </span>
        ) : null}
      </div>
      <p className="streaming-details__hint">
        Paste these into OBS (or your encoder). Visible only to you as the event host.
      </p>

      {error ? <p className="streaming-details__error">{error}</p> : null}

      {!creds && !error ? (
        <p className="streaming-details__loading">Loading…</p>
      ) : creds ? (
        <div className="streaming-details__rows">
          <div className="streaming-details__row">
            <label className="streaming-details__label">Server / RTMP URL</label>
            <div className="streaming-details__value-row">
              <code className="streaming-details__value" title={ingestUrl}>
                {ingestUrl}
              </code>
              <button
                type="button"
                className="streaming-details__btn"
                onClick={() => copyText(ingestUrl, 'url')}
              >
                Copy
              </button>
            </div>
          </div>

          <div className="streaming-details__row">
            <label className="streaming-details__label">Stream Key</label>
            <div className="streaming-details__value-row">
              <code className="streaming-details__value" title={streamKey}>
                {streamKey}
              </code>
              <button
                type="button"
                className="streaming-details__btn"
                onClick={() => copyText(streamKey, 'key')}
              >
                Copy
              </button>
            </div>
          </div>

          <button type="button" className="streaming-details__btn-both" onClick={copyBoth}>
            Copy Both
          </button>
        </div>
      ) : null}
    </section>
  );
}
