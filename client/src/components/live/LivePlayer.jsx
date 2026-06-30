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

function Spinner() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </div>
  );
}

function HlsPlayer({ src, poster }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryRef = useRef(0);
  const reconnectTimer = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState([]); // [{ index, height }]
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = Auto
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;
    setError('');
    setLoading(true);

    // Tuned for slow connections: small initial buffer for fast startup, then
    // a healthy back buffer; ABR starts at a low rendition and adapts upward.
    const hlsConfig = {
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      startLevel: -1,
      maxMaxBufferLength: 60,
      manifestLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 6,
    };

    const scheduleReconnect = () => {
      retryRef.current += 1;
      const delay = Math.min(2000 * retryRef.current, 10000);
      setError(`Reconnecting… (attempt ${retryRef.current})`);
      reconnectTimer.current = setTimeout(() => setReloadKey((k) => k + 1), delay);
    };

    let hls;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari / iOS) — quality is handled by the OS.
      video.src = src;
      video.play?.().catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls(hlsConfig);
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        retryRef.current = 0;
        const lvls = (data.levels || []).map((l, index) => ({ index, height: l.height || 0 }));
        setLevels(lvls);
        video.play?.().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            scheduleReconnect();
        }
      });
    } else {
      setError('HLS is not supported in this browser.');
    }

    const onPlaying = () => {
      setLoading(false);
      setError('');
    };
    const onWaiting = () => setLoading(true);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (hls) hls.destroy();
      hlsRef.current = null;
    };
  }, [src, reloadKey]);

  const pickLevel = (index) => {
    setCurrentLevel(index);
    if (hlsRef.current) hlsRef.current.currentLevel = index; // -1 = auto
  };

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
        poster={poster || undefined}
      />
      {loading && <Spinner />}

      {levels.length > 1 && (
        <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
          <button
            type="button"
            onClick={() => pickLevel(-1)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              currentLevel === -1 ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80'
            }`}
          >
            Auto
          </button>
          {levels
            .slice()
            .sort((a, b) => b.height - a.height)
            .map((l) => (
              <button
                key={l.index}
                type="button"
                onClick={() => pickLevel(l.index)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  currentLevel === l.index ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80'
                }`}
              >
                {l.height ? `${l.height}p` : `Q${l.index + 1}`}
              </button>
            ))}
        </div>
      )}

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
  const poster = config.poster || '';
  // Private-server playback URL (derived from the media server) with fallback.
  const playback = config.playbackUrl || config.hlsUrl;

  if (provider === 'youtube') return <YouTubePlayer videoId={config.youtubeVideoId} />;
  if (provider === 'hls') return <HlsPlayer src={playback} poster={poster} />;
  if (provider === 'webrtc') return <WebRtcPlayer url={config.webrtcUrl} />;
  if (provider === 'rtmp') {
    // RTMP is an ingest protocol; playback uses the media server's HLS output.
    if (playback) return <HlsPlayer src={playback} poster={poster} />;
    return (
      <Offline
        message={
          isLive ? 'Starting the private stream…' : 'Private server stream is offline'
        }
      />
    );
  }

  return <Offline message={isLive ? 'Live, but no player configured' : 'Stream is offline'} />;
}
