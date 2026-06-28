import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

function Frame({ children }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {children}
    </div>
  );
}

function Offline({ message }) {
  return (
    <Frame>
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-xl">
          ▶
        </span>
        <p className="text-sm">{message || 'Stream is offline'}</p>
      </div>
    </Frame>
  );
}

function YouTubePlayer({ videoId }) {
  if (!videoId) return <Offline message="No YouTube video configured" />;
  return (
    <Frame>
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
        title="YouTube live stream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </Frame>
  );
}

function HlsPlayer({ src }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;
    setError('');

    let hls;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari / iOS).
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError('Unable to load the live stream.');
      });
    } else {
      setError('HLS is not supported in this browser.');
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [src]);

  if (!src) return <Offline message="No HLS source configured" />;

  return (
    <Frame>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full"
        controls
        autoPlay
        playsInline
        muted
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-3 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}
    </Frame>
  );
}

function WebRtcPlayer({ url }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return undefined;
    setError('');

    const pc = new RTCPeerConnection();
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (event) => {
      [video.srcObject] = event.streams;
    };

    let cancelled = false;
    (async () => {
      try {
        // WHEP: POST the SDP offer, receive the SDP answer.
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        });
        if (!res.ok) throw new Error(`WHEP endpoint responded ${res.status}`);
        const answer = await res.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      } catch {
        if (!cancelled) setError('Unable to connect to the WebRTC stream.');
      }
    })();

    return () => {
      cancelled = true;
      pc.close();
    };
  }, [url]);

  if (!url) return <Offline message="No WebRTC source configured" />;

  return (
    <Frame>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full"
        controls
        autoPlay
        playsInline
        muted
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-3 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}
    </Frame>
  );
}

/**
 * Renders the appropriate live player for the configured provider.
 * @param {{ config: { provider, youtubeVideoId, hlsUrl, webrtcUrl, isLive } }} props
 */
export default function LivePlayer({ config }) {
  if (!config) return <Offline message="Loading…" />;

  const { provider, isLive } = config;

  if (provider === 'youtube') return <YouTubePlayer videoId={config.youtubeVideoId} />;
  if (provider === 'hls') return <HlsPlayer src={config.hlsUrl} />;
  if (provider === 'webrtc') return <WebRtcPlayer url={config.webrtcUrl} />;
  if (provider === 'rtmp') {
    // RTMP is an ingest protocol; playback requires an HLS/WebRTC output URL.
    if (config.hlsUrl) return <HlsPlayer src={config.hlsUrl} />;
    return <Offline message="RTMP ingest configured — add an HLS playback URL to watch" />;
  }

  return <Offline message={isLive ? 'Live, but no player configured' : 'Stream is offline'} />;
}
