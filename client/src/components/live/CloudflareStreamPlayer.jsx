import { useEffect, useRef } from 'react';
import {
  buildCloudflareStreamIframeUrl,
  CLOUDFLARE_STREAM_SDK_SRC,
} from '../../utils/cloudflareStreamPlayer.js';

function loadStreamSdk() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Stream) return Promise.resolve(window.Stream);
  if (window.__elpCloudflareStreamSdk) return window.__elpCloudflareStreamSdk;
  window.__elpCloudflareStreamSdk = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${CLOUDFLARE_STREAM_SDK_SRC}"]`);
    const script = existing || document.createElement('script');
    const finish = () => resolve(window.Stream || null);
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });
    if (!existing) {
      script.src = CLOUDFLARE_STREAM_SDK_SRC;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.Stream) {
      finish();
    }
  });
  return window.__elpCloudflareStreamSdk;
}

/**
 * Official Cloudflare Stream Web Player for live and recorded VOD.
 * Changes only the UID: Live Input UID while publishing, Video UID after recording.
 */
export default function CloudflareStreamPlayer({
  mode = 'live',
  liveInputUid = '',
  videoUid = '',
  playbackOriginUrl = '',
  iframeUrl = '',
  poster = '',
  title = 'Live stream',
  onEnded,
}) {
  const iframeRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const uid = mode === 'recorded' ? String(videoUid || '').trim() : String(liveInputUid || '').trim();
  const src =
    buildCloudflareStreamIframeUrl({
      originUrl: playbackOriginUrl || iframeUrl,
      uid,
      mode,
      poster,
    }) || String(iframeUrl || '').trim();

  useEffect(() => {
    if (mode !== 'recorded' || !src) return undefined;
    if (!iframeRef.current) return undefined;
    let player;
    let cancelled = false;
    let endedOnce = false;
    const handleEnded = () => {
      if (cancelled || endedOnce) return;
      endedOnce = true;
      onEndedRef.current?.();
    };

    loadStreamSdk()
      .then((Stream) => {
        if (cancelled || !Stream || !iframeRef.current) return;
        try {
          player = Stream(iframeRef.current);
          player.addEventListener('ended', handleEnded);
        } catch {
          /* SDK optional — poll fallback below */
        }
      })
      .catch(() => {});

    const poll = window.setInterval(() => {
      try {
        if (player && typeof player.ended === 'boolean' && player.ended) {
          handleEnded();
        }
      } catch {
        /* ignore */
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      try {
        player?.removeEventListener?.('ended', handleEnded);
      } catch {
        /* ignore */
      }
    };
  }, [mode, src]);

  if (!src) return null;

  return (
    <iframe
      ref={iframeRef}
      className="absolute inset-0 h-full w-full bg-black"
      src={src}
      title={title}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}
