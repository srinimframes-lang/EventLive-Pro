import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  EMBED_SIZE_OPTIONS,
  buildEmbedCode,
  buildEmbedUrl,
  buildIframeCode,
  buildLiveShareUrl,
  buildWhiteLabelEmbedUrl,
  embedPath,
  whiteLabelEmbedOrigin,
} from '../utils/format.js';
import { useToast } from '../hooks/useToast.js';
import ToastBanner from './ToastBanner.jsx';

async function copyText(text) {
  if (!text) throw new Error('Nothing to copy');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Admin Share & Embed card — Live URL, sized embed code, WL domain, QR.
 * Does not change streaming, watch routes, or playback behaviour.
 */
export default function ShareEmbedCard({ event, className = '' }) {
  const { toast, showToast, clearToast } = useToast(2500);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const [sizeId, setSizeId] = useState('responsive');

  const liveUrl = useMemo(() => buildLiveShareUrl(event), [event]);
  const embedUrl = useMemo(() => buildEmbedUrl(event), [event]);
  const wlOrigin = useMemo(() => whiteLabelEmbedOrigin(event), [event]);
  const wlEmbedUrl = useMemo(() => buildWhiteLabelEmbedUrl(event), [event]);
  const previewPath = useMemo(() => embedPath(event), [event]);

  const embedCode = useMemo(
    () => buildEmbedCode(event, { sizeId }),
    [event, sizeId]
  );
  const iframeCode = useMemo(
    () => buildIframeCode(event, { sizeId }),
    [event, sizeId]
  );
  const wlEmbedCode = useMemo(
    () => (wlOrigin ? buildEmbedCode(event, { originOverride: wlOrigin, sizeId }) : ''),
    [event, wlOrigin, sizeId]
  );
  const wlIframeCode = useMemo(
    () => (wlOrigin ? buildIframeCode(event, { originOverride: wlOrigin, sizeId }) : ''),
    [event, wlOrigin, sizeId]
  );

  const fileBase = event?.shortCode || event?.slug || 'event';

  useEffect(() => {
    let active = true;
    if (!liveUrl) {
      setQrDataUrl('');
      return undefined;
    }
    setQrBusy(true);
    QRCode.toDataURL(liveUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1e1b4b', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      })
      .finally(() => {
        if (active) setQrBusy(false);
      });
    return () => {
      active = false;
    };
  }, [liveUrl]);

  const copySuccess = useCallback(
    async (text, successMsg) => {
      try {
        await copyText(text);
        showToast(successMsg, 'success');
      } catch {
        window.prompt('Copy:', text);
      }
    },
    [showToast]
  );

  const downloadPng = useCallback(async () => {
    if (!liveUrl) return;
    try {
      const dataUrl = await QRCode.toDataURL(liveUrl, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e1b4b', light: '#ffffff' },
      });
      const res = await fetch(dataUrl);
      downloadBlob(await res.blob(), `${fileBase}-qr.png`);
    } catch {
      showToast('Could not download QR PNG', 'error');
    }
  }, [liveUrl, fileBase, showToast]);

  const downloadSvg = useCallback(async () => {
    if (!liveUrl) return;
    try {
      const svg = await QRCode.toString(liveUrl, {
        type: 'svg',
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e1b4b', light: '#ffffff' },
      });
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase}-qr.svg`);
    } catch {
      showToast('Could not download QR SVG', 'error');
    }
  }, [liveUrl, fileBase, showToast]);

  if (!liveUrl) return null;

  return (
    <section className={`card ${className}`.trim()}>
      <ToastBanner toast={toast} onClose={clearToast} />
      <h2 className="text-lg font-bold text-slate-900">📺 Share &amp; Embed</h2>
      <p className="mt-1 text-sm text-slate-600">
        Share the live link, embed the player on another site, or download a QR code.
      </p>

      {/* Live URL */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Live URL</h3>
        <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 sm:text-sm">
          {liveUrl}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            Open
          </a>
          <button
            type="button"
            className="btn-outline text-sm"
            onClick={() => copySuccess(liveUrl, '✓ Link Copied')}
          >
            Copy Link
          </button>
        </div>
      </div>

      {/* Embed URL + Preview */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Embed URL</h3>
        <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 sm:text-sm">
          {embedUrl}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-outline text-sm"
            onClick={() => copySuccess(embedUrl, '✓ Link Copied')}
          >
            Copy URL
          </button>
          {previewPath ? (
            <a
              href={previewPath}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm"
            >
              Preview
            </a>
          ) : null}
        </div>
      </div>

      {/* Size + embed / iframe code */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Embed Code
        </h3>
        <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="embedSize">
          iframe size
        </label>
        <select
          id="embedSize"
          className="input mt-1 max-w-xs"
          value={sizeId}
          onChange={(e) => setSizeId(e.target.value)}
        >
          {EMBED_SIZE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>

        <p className="mt-3 text-xs font-medium text-slate-500">Embed snippet</p>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 sm:text-xs">
          {embedCode}
        </pre>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => copySuccess(embedCode, '✓ Embed Code Copied')}
          >
            Copy Embed Code
          </button>
          <button
            type="button"
            className="btn-outline text-sm"
            onClick={() => copySuccess(iframeCode, '✓ Embed Code Copied')}
          >
            Copy iframe Code
          </button>
        </div>
      </div>

      {/* White-label embed */}
      {wlEmbedUrl ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            White Label Embed
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Uses the customer custom domain for embeds.
          </p>
          <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 sm:text-sm">
            {wlEmbedUrl}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => copySuccess(wlEmbedUrl, '✓ Link Copied')}
            >
              Copy URL
            </button>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => copySuccess(wlEmbedCode, '✓ Embed Code Copied')}
            >
              Copy Embed Code
            </button>
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => copySuccess(wlIframeCode, '✓ Embed Code Copied')}
            >
              Copy iframe Code
            </button>
          </div>
        </div>
      ) : null}

      {/* QR */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">QR Code</h3>
        <p className="mt-1 text-sm text-slate-600">QR code for the Live URL above.</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto grid h-[180px] w-[180px] place-items-center rounded-xl border border-slate-200 bg-white p-2 sm:mx-0">
            {qrBusy && !qrDataUrl ? (
              <span className="text-xs text-slate-400">Generating…</span>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Event live QR code"
                width={160}
                height={160}
                className="h-[160px] w-[160px]"
              />
            ) : (
              <span className="text-xs text-slate-400">No QR yet</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:pt-2">
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={downloadPng}
              disabled={!liveUrl || qrBusy}
            >
              Download PNG
            </button>
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={downloadSvg}
              disabled={!liveUrl || qrBusy}
            >
              Download SVG
            </button>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => copySuccess(liveUrl, '✓ Link Copied')}
            >
              Copy Live Link
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
