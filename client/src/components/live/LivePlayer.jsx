import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { extractYouTubeId } from '../../utils/format.js';
import { resolveServerPlaybackUrl } from '../../utils/streamPlayback.js';

const RETRY_MS = 3000;
const OFFLINE_MSG = '🔴 Live stream is currently offline.';
const SERVER_WAITING_MSG = 'Waiting for Live...';

const OVERLAY = {
  NONE: 'none',
  BUFFERING: 'buffering',
  RECONNECTING: 'reconnecting',
};

function Frame({ children }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
      {children}
    </div>
  );
}

function Offline({ message = OFFLINE_MSG }) {
  return (
    <Frame>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-6 text-center text-white">
        <p className="text-lg font-bold leading-snug sm:text-xl">{message}</p>
      </div>
    </Frame>
  );
}

function PlayerOverlay({ state }) {
  if (state === OVERLAY.NONE) return null;

  const isBuffering = state === OVERLAY.BUFFERING;
  const icon = isBuffering ? '📶' : '🔄';
  const title = isBuffering ? 'Network is slow.' : 'Reconnecting to the live stream...';
  const subtitle = isBuffering ? 'Please wait while we reconnect to the live stream...' : '';

  return (
    <div className="player-overlay" role="status" aria-live="polite">
      <div className="player-overlay-panel">
        <div className="player-overlay-spinner" aria-hidden />
        <p className="player-overlay-title">
          <span aria-hidden>{icon}</span> {title}
        </p>
        {subtitle && <p className="player-overlay-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}

function YouTubePlayer({ videoId }) {
  if (!videoId) {
    return (
      <Frame>
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
          No YouTube video configured
        </div>
      </Frame>
    );
  }

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

function resolveYoutubeVideoId(config) {
  return (
    extractYouTubeId(config?.youtubeVideoId || '') ||
    extractYouTubeId(config?.streamUrl || '')
  );
}

function HlsPlayer({ src, poster, isLive = true, detectPublish = false }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimer = useRef(null);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const hasPlayedRef = useRef(false);
  const [showOffline, setShowOffline] = useState(false);

  const clearRetry = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    clearRetry();
    setOverlay(OVERLAY.RECONNECTING);
    retryTimer.current = setTimeout(() => {
      setReloadKey((k) => k + 1);
    }, RETRY_MS);
  }, [clearRetry]);

  useEffect(() => {
    if (!detectPublish && !isLive) return undefined;
    const video = videoRef.current;
    if (!video || !src) return undefined;

    setShowOffline(false);
    hasPlayedRef.current = false;
    setOverlay(OVERLAY.BUFFERING);

    const hlsConfig = {
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      startLevel: -1,
      maxMaxBufferLength: 60,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 4,
    };

    let hls;
    let useNative = false;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      useNative = true;
      video.src = src;
      video.load();
      video.play?.().catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls(hlsConfig);
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const lvls = (data.levels || []).map((l, index) => ({ index, height: l.height || 0 }));
        setLevels(lvls);
        clearRetry();
        setShowOffline(false);
        setOverlay(OVERLAY.NONE);
        video.play?.().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_LOADED, () => {
        clearRetry();
        setShowOffline(false);
        setOverlay(OVERLAY.NONE);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (hlsRef.current) setCurrentLevel(hlsRef.current.autoLevelEnabled ? -1 : data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL ||
            data.type === Hls.ErrorTypes.NETWORK_ERROR
          ) {
            setOverlay(OVERLAY.BUFFERING);
          }
          return;
        }
        setOverlay(OVERLAY.RECONNECTING);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (detectPublish && !hasPlayedRef.current) setShowOffline(true);
            try {
              hls.startLoad();
            } catch {
              /* reload below */
            }
            scheduleRetry();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            try {
              hls.recoverMediaError();
            } catch {
              scheduleRetry();
            }
            break;
          default:
            hls.destroy();
            hlsRef.current = null;
            if (detectPublish && !hasPlayedRef.current) setShowOffline(true);
            scheduleRetry();
        }
      });
    } else {
      if (detectPublish) setShowOffline(true);
      scheduleRetry();
    }

    const onPlaying = () => {
      clearRetry();
      hasPlayedRef.current = true;
      setShowOffline(false);
      setOverlay(OVERLAY.NONE);
    };
    const onCanPlay = () => {
      clearRetry();
      setShowOffline(false);
      setOverlay(OVERLAY.NONE);
    };
    const onVideoError = () => {
      if (useNative) {
        if (detectPublish && !hasPlayedRef.current) setShowOffline(true);
        scheduleRetry();
      }
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onVideoError);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onVideoError);
      clearRetry();
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, reloadKey, isLive, detectPublish, scheduleRetry, clearRetry]);

  const pickLevel = (index) => {
    setCurrentLevel(index);
    if (hlsRef.current) hlsRef.current.currentLevel = index;
  };

  if (!detectPublish && !isLive) return <Offline message={SERVER_WAITING_MSG} />;
  if (!src) return <Offline message={SERVER_WAITING_MSG} />;

  return (
    <Frame>
      {showOffline && overlay === OVERLAY.NONE && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 px-6 text-center text-white">
          <div className="mb-4 h-11 w-11 animate-pulse rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          <p className="text-lg font-bold leading-snug sm:text-xl">{SERVER_WAITING_MSG}</p>
        </div>
      )}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls
        controlsList="nodownload"
        autoPlay
        playsInline
        muted
        poster={poster || undefined}
      />
      <PlayerOverlay state={overlay} />

      {levels.length > 1 && overlay === OVERLAY.NONE && (
        <div className="absolute right-2 top-2 z-20 flex flex-wrap justify-end gap-1">
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
    </Frame>
  );
}

function WebRtcPlayer({ url, isLive = true }) {
  const videoRef = useRef(null);
  const retryTimer = useRef(null);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [reloadKey, setReloadKey] = useState(0);

  const scheduleRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setOverlay(OVERLAY.RECONNECTING);
    retryTimer.current = setTimeout(() => setReloadKey((k) => k + 1), RETRY_MS);
  }, []);

  useEffect(() => {
    if (!isLive) return undefined;
    const video = videoRef.current;
    if (!video || !url) return undefined;

    setOverlay(OVERLAY.BUFFERING);
    const pc = new RTCPeerConnection();
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (event) => {
      [video.srcObject] = event.streams;
      video.play?.().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        scheduleRetry();
      }
    };

    let cancelled = false;
    (async () => {
      try {
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
        setOverlay(OVERLAY.NONE);
      } catch {
        if (!cancelled) scheduleRetry();
      }
    })();

    const onPlaying = () => setOverlay(OVERLAY.NONE);
    const onWaiting = () => setOverlay(OVERLAY.BUFFERING);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

    return () => {
      cancelled = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      pc.close();
    };
  }, [url, reloadKey, isLive, scheduleRetry]);

  if (!isLive) return <Offline />;
  if (!url) return <Offline message="No WebRTC source configured" />;

  return (
    <Frame>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls
        autoPlay
        playsInline
        muted
      />
      <PlayerOverlay state={overlay} />
    </Frame>
  );
}

/**
 * Renders the appropriate live player for the configured provider.
 */
export default function LivePlayer({ config }) {
  if (!config) {
    return <Frame />;
  }

  if (config.streamDisabled) {
    return <Offline message="This live stream has been disabled." />;
  }

  const videoId = resolveYoutubeVideoId(config);
  const isServerProvider =
    config.provider === 'rtmp' || config.provider === 'hls' || config.provider === 'webrtc';
  const isYoutube = !isServerProvider && (config.provider === 'youtube' || Boolean(videoId));

  if (isYoutube) {
    return <YouTubePlayer videoId={videoId} />;
  }

  const { provider, isLive } = config;
  const poster = config.poster || '';
  const live = Boolean(isLive);
  const isMediaMtx = provider === 'rtmp' || provider === 'hls';

  if (isMediaMtx) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={SERVER_WAITING_MSG} />;
    return (
      <HlsPlayer
        src={playback}
        poster={poster}
        isLive={live}
        detectPublish
      />
    );
  }

  if (!live) {
    return <Offline message={OFFLINE_MSG} />;
  }

  const playback = resolveServerPlaybackUrl(config) || config.playbackUrl || config.hlsUrl;
  if (provider === 'hls') return <HlsPlayer src={playback} poster={poster} isLive={live} />;
  if (provider === 'webrtc') return <WebRtcPlayer url={config.webrtcUrl} isLive={live} />;

  return <Offline message="Live stream is not configured yet." />;
}
