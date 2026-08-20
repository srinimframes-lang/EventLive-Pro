import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { eventService } from '../../services/event.service.js';

function isTypingTarget(el) {
  if (!el || el === document.body) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    if (el.readOnly || el.disabled) return false;
    return true;
  }
  if (tag === 'select') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.('[contenteditable="true"]'));
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy Stream Key:', text);
    return true;
  }
}

/** K copies the last hovered/focused admin copy control. */
const shortcutOwners = new Set();
let preferredOwner = null;
let shortcutBound = false;

function onGlobalKey(e) {
  if (e.key !== 'k' && e.key !== 'K') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
  const owner = preferredOwner || [...shortcutOwners].at(-1);
  if (!owner) return;
  e.preventDefault();
  owner();
}

function bindShortcut(handler) {
  if (!shortcutBound && typeof window !== 'undefined') {
    window.addEventListener('keydown', onGlobalKey);
    shortcutBound = true;
  }
  shortcutOwners.add(handler);
  if (!preferredOwner) preferredOwner = handler;
  return () => {
    shortcutOwners.delete(handler);
    if (preferredOwner === handler) preferredOwner = [...shortcutOwners].at(-1) || null;
  };
}

/**
 * Admin/Super Admin only. Loads the YouTube stream key from the existing
 * protected /youtube-ingest API — never from the public event payload.
 */
export default function CopyYoutubeStreamKey({
  eventId,
  ingest = null,
  enableShortcut = true,
  compact = false,
}) {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(ingest);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copyRef = useRef(async () => {});

  useEffect(() => {
    if (ingest && (ingest.streamKey || ingest.watchUrl)) setData(ingest);
  }, [ingest]);

  const loadIngest = useCallback(async () => {
    if (data?.streamKey) return data;
    if (!eventId) return data || null;
    setBusy(true);
    setError('');
    try {
      const next = await eventService.getYoutubeIngest(eventId);
      setData(next);
      return next;
    } catch (err) {
      setError(err.message || 'Could not load Stream Key');
      return data || null;
    } finally {
      setBusy(false);
    }
  }, [data, eventId]);

  const copyKey = useCallback(async () => {
    const next = await loadIngest();
    const key = String(next?.streamKey || '').trim();
    if (!key) {
      setError('Stream Key is not available yet');
      return;
    }
    await writeClipboard(key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [loadIngest]);

  copyRef.current = copyKey;

  useEffect(() => {
    if (!isAdmin || !eventId || compact) return undefined;
    if (ingest?.streamKey) return undefined;
    let active = true;
    eventService
      .getYoutubeIngest(eventId)
      .then((next) => {
        if (active) setData(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAdmin, eventId, compact, ingest?.streamKey]);

  useEffect(() => {
    if (!isAdmin || !enableShortcut) return undefined;
    const handler = () => copyRef.current();
    return bindShortcut(handler);
  }, [isAdmin, enableShortcut, eventId]);

  if (!isAdmin || !eventId) return null;

  const watchUrl = String(data?.watchUrl || '').trim();
  const streamKey = String(data?.streamKey || '').trim();
  const label = copied ? '✓ Stream Key Copied' : busy ? 'Loading…' : '🔑 Copy Stream Key';

  if (compact) {
    return (
      <span className="inline-flex flex-col items-start gap-1" onPointerEnter={() => {
        preferredOwner = () => copyRef.current();
      }}>
        <button type="button" className="btn-outline" disabled={busy} onClick={copyKey} onFocus={() => {
          preferredOwner = () => copyRef.current();
        }}>
          {label}
        </button>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </span>
    );
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"
      onPointerEnter={() => {
        preferredOwner = () => copyRef.current();
      }}
    >
      <p className="text-sm font-semibold text-emerald-900">YouTube Live</p>
      {watchUrl ? (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">YouTube Live URL</p>
          <p className="break-all font-mono text-xs text-slate-800">{watchUrl}</p>
        </div>
      ) : null}
      {streamKey ? (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Stream Key</p>
          <p className="break-all font-mono text-xs text-slate-800">{streamKey}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          {busy ? 'Loading Stream Key…' : 'Stream Key loads when YouTube Live is ready.'}
        </p>
      )}
      <button type="button" className="btn-primary" disabled={busy} onClick={copyKey}>
        {label}
      </button>
      <p className="text-xs text-slate-500">Press K to copy the Stream Key.</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
