import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildWatchUrl, resolveMediaUrl } from '../utils/format.js';
import { eventService } from '../services/event.service.js';

/**
 * Admin QR card — live URL, stored QR image, share & download actions.
 */
export default function EventQrCard({
  event,
  onQrUpdated,
  suspendAutoSync = false,
  className = '',
}) {
  const [qrImage, setQrImage] = useState(event?.qrCodeImage || '');
  const [targetUrl, setTargetUrl] = useState(event?.qrCodeTargetUrl || '');
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const syncingRef = useRef(false);

  const liveUrl = useMemo(() => buildWatchUrl(event), [event]);
  const displayTitle = useMemo(() => {
    if (event?.brideName && event?.groomName) {
      return `${event.groomName} & ${event.brideName}`;
    }
    return event?.title || 'Live event';
  }, [event]);

  const qrSrc = resolveMediaUrl(qrImage);

  const syncQr = useCallback(async () => {
    if (!event?.id) return;
    setSyncing(true);
    setError('');
    try {
      const data = await eventService.syncQr(event.id);
      setQrImage(data.qrCodeImage);
      setTargetUrl(data.qrCodeTargetUrl);
      onQrUpdated?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [event?.id, onQrUpdated]);

  useEffect(() => {
    setQrImage(event?.qrCodeImage || '');
    setTargetUrl(event?.qrCodeTargetUrl || '');
  }, [event?.qrCodeImage, event?.qrCodeTargetUrl]);

  useEffect(() => {
    if (suspendAutoSync || !event?.id || !liveUrl || syncingRef.current) return;
    if (targetUrl === liveUrl && qrImage) return;
    syncingRef.current = true;
    syncQr().finally(() => {
      syncingRef.current = false;
    });
  }, [suspendAutoSync, event?.id, liveUrl, targetUrl, qrImage, syncQr]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this live link:', liveUrl);
    }
  };

  const whatsappShare = () => {
    const text = `${displayTitle}\nWatch live: ${liveUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const downloadPng = async () => {
    if (!qrSrc) return;
    try {
      const res = await fetch(qrSrc);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${event.shortCode || event.slug || 'event'}-qr.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('Could not download QR image');
    }
  };

  const printPdf = () => {
    if (!qrSrc) return;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html><head><title>QR — ${displayTitle}</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; }
  img { width: 280px; height: 280px; }
  h1 { font-size: 1.25rem; margin: 1rem 0 0.5rem; }
  p { font-size: 0.85rem; color: #444; word-break: break-all; }
</style></head><body>
  <img src="${qrSrc}" alt="Event QR code" />
  <h1>${displayTitle}</h1>
  <p>${liveUrl}</p>
  <p>Scan to watch live on EventLive Pro</p>
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  if (!liveUrl) return null;

  return (
    <section className={`event-qr-card card ${className}`.trim()}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 sm:mx-0">
          <div className="event-qr-frame grid place-items-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {syncing && !qrSrc ? (
              <div className="grid h-[200px] w-[200px] place-items-center text-sm text-slate-500 sm:h-[220px] sm:w-[220px]">
                Generating QR…
              </div>
            ) : qrSrc ? (
              <img
                src={qrSrc}
                alt={`QR code for ${displayTitle}`}
                width={220}
                height={220}
                className="h-[200px] w-[200px] sm:h-[220px] sm:w-[220px]"
              />
            ) : (
              <button type="button" className="btn-ghost text-sm" onClick={syncQr}>
                Generate QR
              </button>
            )}
          </div>
          {syncing && qrSrc && (
            <p className="mt-2 text-center text-xs text-slate-400">Updating QR…</p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Live link &amp; QR code</h2>
          <p className="mt-1 text-sm text-slate-600">
            Guests scan the QR or open the link to watch. Updates automatically when the live URL
            changes.
          </p>
          <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
            {liveUrl}
          </p>

          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button type="button" className="btn-primary col-span-2 sm:col-span-1" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy live link'}
            </button>
            <button
              type="button"
              className="btn inline-flex items-center justify-center gap-2 bg-[#25D366] text-white hover:bg-[#1da851]"
              onClick={whatsappShare}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={downloadPng}
              disabled={!qrSrc || syncing}
            >
              Download PNG
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={printPdf}
              disabled={!qrSrc || syncing}
            >
              Print PDF
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
