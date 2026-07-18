import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { extractYouTubeId, resolveMediaUrl } from '../../utils/format.js';
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

function isActivelyPlaying(video) {
  return Boolean(
    video &&
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  );
}

function formatClock(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** YouTube-style LIVE badge — click jumps to the live edge when watching DVR. */
function LiveDvrBadge({ behindLive, lagSec, onGoLive }) {
  return (
    <div className="absolute left-2 top-2 z-20 flex items-center gap-2">
      <button
        type="button"
        onClick={onGoLive}
        disabled={!behindLive}
        title={behindLive ? 'Jump to live' : 'Watching live'}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white shadow ${
          behindLive
            ? 'cursor-pointer bg-slate-800/90 ring-1 ring-white/25 hover:bg-red-600'
            : 'cursor-default bg-red-600'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full bg-white ${behindLive ? '' : 'animate-pulse'}`}
          aria-hidden
        />
        Live
      </button>
      {behindLive && lagSec >= 3 && (
        <span className="rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white/90">
          −{formatClock(lagSec)} · seek to rewind
        </span>
      )}
    </div>
  );
}

function HlsPlayer({ src, poster, isLive = true, detectPublish = false }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimer = useRef(null);
  const dvrTimer = useRef(null);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const hasPlayedRef = useRef(false);
  const [showOffline, setShowOffline] = useState(false);
  const [behindLive, setBehindLive] = useState(false);
  const [lagSec, setLagSec] = useState(0);

  const clearRetry = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const hideOverlay = useCallback(() => {
    clearRetry();
    setShowOffline(false);
    setOverlay(OVERLAY.NONE);
  }, [clearRetry]);

  const markPlaying = useCallback(() => {
    hasPlayedRef.current = true;
    hideOverlay();
  }, [hideOverlay]);

  /** Never cover a playing video — only show stall/reconnect UI when playback is actually stopped. */
  const showOverlayIfNotPlaying = useCallback((state) => {
    if (hasPlayedRef.current && isActivelyPlaying(videoRef.current)) return;
    setOverlay(state);
  }, []);

  const scheduleRetry = useCallback(() => {
    clearRetry();
    showOverlayIfNotPlaying(OVERLAY.RECONNECTING);
    retryTimer.current = setTimeout(() => {
      setReloadKey((k) => k + 1);
    }, RETRY_MS);
  }, [clearRetry, showOverlayIfNotPlaying]);

  const jumpToLive = useCallback(() => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    if (!video) return;
    let target = null;
    if (hls && Number.isFinite(hls.liveSyncPosition)) {
      target = hls.liveSyncPosition;
    } else if (video.seekable && video.seekable.length > 0) {
      const end = video.seekable.end(video.seekable.length - 1);
      target = Math.max(0, end - 0.25);
    }
    if (target != null && Number.isFinite(target)) {
      try {
        video.currentTime = target;
      } catch {
        /* ignore seek race */
      }
    }
    video.play?.().catch(() => {});
    setBehindLive(false);
    setLagSec(0);
  }, []);

  useEffect(() => {
    if (!detectPublish && !isLive) return undefined;
    const video = videoRef.current;
    if (!video || !src) return undefined;

    setShowOffline(false);
    hasPlayedRef.current = false;
    setOverlay(OVERLAY.BUFFERING);
    setBehindLive(false);
    setLagSec(0);

    const hlsConfig = {
      enableWorker: true,
      // Classic HLS + long MediaMTX playlist = YouTube-style DVR.
      // Start one segment behind live (~2s) for a 1–2s join.
      lowLatencyMode: false,
      liveDurationInfinity: true,
      backBufferLength: 120,
      maxBufferLength: 12,
      maxMaxBufferLength: 30,
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 5,
      maxLiveSyncPlaybackRate: 1.15,
      startFragPrefetch: true,
      startLevel: -1,
      fragLoadingTimeOut: 30000,
      manifestLoadingTimeOut: 15000,
      levelLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 1000,
      manifestLoadingRetryDelay: 1000,
    };

    let hls;
    let useNative = false;
    let frameCallbackId = null;

    const refreshDvrState = () => {
      if (!video) return;
      let liveEdge = null;
      if (hlsRef.current && Number.isFinite(hlsRef.current.liveSyncPosition)) {
        liveEdge = hlsRef.current.liveSyncPosition;
      } else if (video.seekable && video.seekable.length > 0) {
        liveEdge = video.seekable.end(video.seekable.length - 1);
      }
      if (liveEdge == null || !Number.isFinite(liveEdge)) {
        setBehindLive(false);
        setLagSec(0);
        return;
      }
      const lag = Math.max(0, liveEdge - video.currentTime);
      setLagSec(lag);
      // More than ~1.5 segments behind counts as time-shifted (DVR) viewing.
      setBehindLive(lag > 3.5);
    };

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
        video.play?.().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (hlsRef.current) setCurrentLevel(hlsRef.current.autoLevelEnabled ? -1 : data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          return;
        }
        if (hasPlayedRef.current && isActivelyPlaying(video)) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              hls.startLoad();
            } catch {
              /* ignore */
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              /* ignore */
            }
          }
          return;
        }
        showOverlayIfNotPlaying(OVERLAY.RECONNECTING);
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

    const onPlaying = () => markPlaying();
    const onLoadedData = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markPlaying();
    };
    const onTimeUpdate = () => {
      if (video.currentTime > 0) markPlaying();
      refreshDvrState();
    };
    const onSeeked = () => refreshDvrState();
    const onVideoError = () => {
      if (useNative) {
        if (detectPublish && !hasPlayedRef.current) setShowOffline(true);
        scheduleRetry();
      }
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onVideoError);
    dvrTimer.current = setInterval(refreshDvrState, 1000);

    if (typeof video.requestVideoFrameCallback === 'function') {
      frameCallbackId = video.requestVideoFrameCallback(() => markPlaying());
    }

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onVideoError);
      if (dvrTimer.current) {
        clearInterval(dvrTimer.current);
        dvrTimer.current = null;
      }
      if (frameCallbackId != null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
      clearRetry();
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [
    src,
    reloadKey,
    isLive,
    detectPublish,
    scheduleRetry,
    clearRetry,
    markPlaying,
    showOverlayIfNotPlaying,
  ]);

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
      {overlay === OVERLAY.NONE && !showOffline && (
        <LiveDvrBadge behindLive={behindLive} lagSec={lagSec} onGoLive={jumpToLive} />
      )}

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
    const onWaiting = () => {
      if (isActivelyPlaying(video)) return;
      setOverlay(OVERLAY.BUFFERING);
    };
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

function Mp4Player({ src, poster, eventId = '' }) {
  const videoRef = useRef(null);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [resolvedSrc, setResolvedSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    setOverlay(OVERLAY.BUFFERING);
    setResolvedSrc('');

    (async () => {
      let playSrc = src;
      // Prefer a direct R2/presigned URL so <video> does not depend on cross-origin
      // redirect behavior from the API route.
      if (eventId) {
        try {
          const { streamService } = await import('../../services/stream.service.js');
          const info = await streamService.resolveRecordingPlayUrl(eventId);
          if (info?.url) playSrc = info.url;
        } catch {
          /* fall back to API recording path */
        }
      }
      if (!cancelled) setResolvedSrc(playSrc || '');
    })();

    return () => {
      cancelled = true;
    };
  }, [src, eventId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedSrc) return undefined;
    setOverlay(OVERLAY.BUFFERING);
    video.src = resolvedSrc;
    video.load();
    video.play?.().catch(() => {});

    const onPlaying = () => setOverlay(OVERLAY.NONE);
    const onWaiting = () => {
      if (isActivelyPlaying(video)) return;
      setOverlay(OVERLAY.BUFFERING);
    };
    const onError = () => setOverlay(OVERLAY.RECONNECTING);

    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
    };
  }, [resolvedSrc]);

  if (!src) return <Offline message="Recording is not available." />;

  return (
    <Frame>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls
        controlsList="nodownload"
        playsInline
        poster={poster || undefined}
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
  const recordingSrc = resolveMediaUrl(config.recordingUrl || '');
  const eventId = config.eventId || '';

  // Live OBS publish always wins; when offline, fall back to recorded replay.
  if (isMediaMtx && live) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={SERVER_WAITING_MSG} />;
    return (
      <HlsPlayer
        src={playback}
        poster={poster}
        isLive
        detectPublish
      />
    );
  }

  if (isMediaMtx && recordingSrc) {
    return <Mp4Player src={recordingSrc} poster={poster} eventId={eventId} />;
  }

  if (isMediaMtx) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={SERVER_WAITING_MSG} />;
    return (
      <HlsPlayer
        src={playback}
        poster={poster}
        isLive={false}
        detectPublish
      />
    );
  }

  if (!live && recordingSrc) {
    return <Mp4Player src={recordingSrc} poster={poster} eventId={eventId} />;
  }

  if (!live) {
    return <Offline message={OFFLINE_MSG} />;
  }

  const playback = resolveServerPlaybackUrl(config) || config.playbackUrl || config.hlsUrl;
  if (provider === 'hls') return <HlsPlayer src={playback} poster={poster} isLive={live} />;
  if (provider === 'webrtc') return <WebRtcPlayer url={config.webrtcUrl} isLive={live} />;

  return <Offline message="Live stream is not configured yet." />;
}
