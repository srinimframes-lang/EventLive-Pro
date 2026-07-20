import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { extractYouTubeId, resolveMediaUrl } from '../../utils/format.js';
import { resolveServerPlaybackUrl } from '../../utils/streamPlayback.js';

const RETRY_MS = 3000;
const CONTROLS_HIDE_MS = 2600;
const OFFLINE_MSG = 'Live stream is currently offline.';
const SERVER_WAITING_MSG = 'Waiting for live…';
const ENDED_MSG = 'This live stream has ended.';

const OVERLAY = {
  NONE: 'none',
  BUFFERING: 'buffering',
  RECONNECTING: 'reconnecting',
};

function Frame({ children, shellRef, className = '' }) {
  return (
    <div ref={shellRef} className={`elp-player ${className}`.trim()}>
      {children}
    </div>
  );
}

function Offline({ message = OFFLINE_MSG }) {
  return (
    <Frame>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
        <p className="text-base font-semibold leading-snug text-white/90 sm:text-lg">{message}</p>
      </div>
    </Frame>
  );
}

/** Quiet spinner — no large reconnect banners. */
function QuietSpinner({ show }) {
  if (!show) return null;
  return (
    <div className="player-overlay" role="status" aria-live="polite" aria-label="Loading">
      <div className="player-overlay-spinner" aria-hidden />
    </div>
  );
}

function IconPlay({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  );
}

function IconVolume({ muted }) {
  if (muted) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.5 12A4.5 4.5 0 0 0 14 8.04v2.21l2.45 2.45c.03-.22.05-.45.05-.7zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.04v7.92A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function IconFullscreen() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

function formatClock(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
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
        title="Live stream"
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

/**
 * Shared chrome: auto-hiding controls, center play, volume, fullscreen, scrubber.
 */
function usePlayerChrome(videoRef, shellRef, { isLiveMode = false } = {}) {
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekMin, setSeekMin] = useState(0);
  const [seekMax, setSeekMax] = useState(0);
  const hideTimer = useRef(null);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const video = videoRef.current;
    if (video && !video.paused) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    }
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const sync = () => {
      setPaused(video.paused);
      setMuted(video.muted);
      setCurrent(video.currentTime || 0);
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(dur > 0 && Number.isFinite(dur) ? dur : 0);
      if (video.seekable && video.seekable.length > 0) {
        setSeekMin(video.seekable.start(0));
        setSeekMax(video.seekable.end(video.seekable.length - 1));
      } else if (!isLiveMode && dur > 0) {
        setSeekMin(0);
        setSeekMax(dur);
      }
    };

    const onPlay = () => {
      setPaused(false);
      bumpControls();
    };
    const onPause = () => {
      setPaused(true);
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', sync);
    video.addEventListener('durationchange', sync);
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('volumechange', sync);
    sync();

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('volumechange', sync);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [videoRef, bumpControls, isLiveMode]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play?.().catch(() => {});
    else video.pause();
    bumpControls();
  }, [videoRef, bumpControls]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    bumpControls();
  }, [videoRef, bumpControls]);

  const seekTo = useCallback(
    (t) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(t)) return;
      try {
        video.currentTime = t;
      } catch {
        /* ignore */
      }
      bumpControls();
    },
    [videoRef, bumpControls]
  );

  const toggleFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (videoRef.current?.webkitEnterFullscreen) {
      videoRef.current.webkitEnterFullscreen();
    }
    bumpControls();
  }, [shellRef, videoRef, bumpControls]);

  return {
    paused,
    muted,
    controlsVisible,
    current,
    duration,
    seekMin,
    seekMax,
    bumpControls,
    togglePlay,
    toggleMute,
    seekTo,
    toggleFullscreen,
    setControlsVisible,
  };
}

function PlayerChrome({
  chrome,
  isLiveMode,
  behindLive,
  lagSec,
  onGoLive,
  levels = [],
  currentLevel = -1,
  onPickLevel,
  statusLabel = '',
}) {
  const showChrome = chrome.controlsVisible || chrome.paused;
  const scrubMin = chrome.seekMin;
  const scrubMax = Math.max(chrome.seekMax, scrubMin + 0.01);
  const scrubVal = Math.min(Math.max(chrome.current, scrubMin), scrubMax);
  const showScrub = isLiveMode
    ? chrome.seekMax - chrome.seekMin > 4
    : chrome.duration > 0 || chrome.seekMax > 0;

  return (
    <>
      {chrome.paused && (
        <button
          type="button"
          className="elp-player-center-play"
          aria-label="Play"
          onClick={chrome.togglePlay}
        >
          <IconPlay className="ml-0.5 h-8 w-8 sm:h-10 sm:w-10" />
        </button>
      )}

      <div
        className={`elp-player-chrome ${showChrome ? '' : 'elp-player-chrome-hidden'}`}
        onMouseMove={chrome.bumpControls}
        onTouchStart={chrome.bumpControls}
      >
        <div className="elp-player-gradient-top px-2 pt-2 sm:px-3">
          <div className="flex flex-wrap items-center gap-2">
            {isLiveMode && (
              <button
                type="button"
                onClick={onGoLive}
                disabled={!behindLive}
                title={behindLive ? 'Jump to live' : 'Watching live'}
                className={`elp-live-pill ${behindLive ? 'elp-live-pill-behind' : 'elp-live-pill-on'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full bg-white ${behindLive ? '' : 'animate-pulse'}`}
                  aria-hidden
                />
                Live
              </button>
            )}
            {isLiveMode && behindLive && lagSec >= 3 && (
              <span className="elp-status-chip">−{formatClock(lagSec)} behind</span>
            )}
            {statusLabel && <span className="elp-status-chip">{statusLabel}</span>}
          </div>
        </div>

        <div className="flex-1" onClick={chrome.togglePlay} onDoubleClick={chrome.toggleFullscreen} />

        <div className="elp-player-gradient-bottom">
          {showScrub && (
            <input
              type="range"
              className="elp-player-scrub mb-2"
              min={scrubMin}
              max={scrubMax}
              step="any"
              value={scrubVal}
              aria-label={isLiveMode ? 'Seek in live timeline' : 'Seek'}
              onChange={(e) => chrome.seekTo(Number(e.target.value))}
              onPointerDown={chrome.bumpControls}
            />
          )}
          <div className="elp-player-bar">
            <button type="button" className="elp-player-btn" aria-label={chrome.paused ? 'Play' : 'Pause'} onClick={chrome.togglePlay}>
              {chrome.paused ? <IconPlay /> : <IconPause />}
            </button>
            <button
              type="button"
              className="elp-player-btn"
              aria-label={chrome.muted ? 'Unmute' : 'Mute'}
              onClick={chrome.toggleMute}
            >
              <IconVolume muted={chrome.muted} />
            </button>

            {!isLiveMode && (
              <span className="ml-1 tabular-nums text-[11px] font-medium text-white/90 sm:text-xs">
                {formatClock(chrome.current)}
                {chrome.duration > 0 ? ` / ${formatClock(chrome.duration)}` : ''}
              </span>
            )}

            {isLiveMode && behindLive && (
              <button
                type="button"
                className="ml-1 rounded bg-red-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-red-500"
                onClick={onGoLive}
              >
                Go live
              </button>
            )}

            <div className="flex-1" />

            {levels.length > 1 && (
              <select
                className="max-w-[5.5rem] rounded bg-black/40 px-1.5 py-1 text-[11px] font-semibold text-white outline-none ring-1 ring-white/20"
                value={currentLevel}
                aria-label="Quality"
                onChange={(e) => onPickLevel?.(Number(e.target.value))}
              >
                <option value={-1}>Auto</option>
                {levels
                  .slice()
                  .sort((a, b) => b.height - a.height)
                  .map((l) => (
                    <option key={l.index} value={l.index}>
                      {l.height ? `${l.height}p` : `Q${l.index + 1}`}
                    </option>
                  ))}
              </select>
            )}

            <button type="button" className="elp-player-btn" aria-label="Fullscreen" onClick={chrome.toggleFullscreen}>
              <IconFullscreen />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function HlsPlayer({ src, poster, isLive = true, detectPublish = false }) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
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

  const chrome = usePlayerChrome(videoRef, shellRef, { isLiveMode: true });

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

  const showOverlayIfNotPlaying = useCallback((state) => {
    if (hasPlayedRef.current && isActivelyPlaying(videoRef.current)) return;
    setOverlay(state);
  }, []);

  const scheduleRetry = useCallback(() => {
    clearRetry();
    // Silent background retry — spinner only, no reconnect banner.
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
    chrome.bumpControls();
  }, [chrome]);

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
        // Snap near live edge for fast start after manifest is ready.
        if (Number.isFinite(hls.liveSyncPosition)) {
          try {
            video.currentTime = hls.liveSyncPosition;
          } catch {
            /* ignore */
          }
        }
        video.play?.().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (hlsRef.current) setCurrentLevel(hlsRef.current.autoLevelEnabled ? -1 : data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
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
    const onWaiting = () => {
      if (hasPlayedRef.current && isActivelyPlaying(video)) return;
      if (hasPlayedRef.current) setOverlay(OVERLAY.BUFFERING);
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
    video.addEventListener('waiting', onWaiting);
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
      video.removeEventListener('waiting', onWaiting);
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
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
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
    chrome.bumpControls();
  };

  if (!detectPublish && !isLive) return <Offline message={SERVER_WAITING_MSG} />;
  if (!src) return <Offline message={SERVER_WAITING_MSG} />;

  const showSpinner =
    (overlay === OVERLAY.BUFFERING || overlay === OVERLAY.RECONNECTING) && !showOffline;

  return (
    <Frame shellRef={shellRef}>
      {showOffline && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
          <QuietSpinner show />
          <p className="mt-4 text-base font-semibold text-white/90">{SERVER_WAITING_MSG}</p>
        </div>
      )}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls={false}
        controlsList="nodownload"
        autoPlay
        playsInline
        muted
        poster={poster || undefined}
        onClick={chrome.togglePlay}
        onMouseMove={chrome.bumpControls}
        onTouchStart={chrome.bumpControls}
      />
      <QuietSpinner show={showSpinner} />
      {!showOffline && (
        <PlayerChrome
          chrome={chrome}
          isLiveMode
          behindLive={behindLive}
          lagSec={lagSec}
          onGoLive={jumpToLive}
          levels={levels}
          currentLevel={currentLevel}
          onPickLevel={pickLevel}
        />
      )}
    </Frame>
  );
}

function WebRtcPlayer({ url, isLive = true }) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const retryTimer = useRef(null);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [reloadKey, setReloadKey] = useState(0);
  const chrome = usePlayerChrome(videoRef, shellRef, { isLiveMode: true });

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
      video.srcObject = null;
    };
  }, [url, reloadKey, isLive, scheduleRetry]);

  if (!isLive) return <Offline />;
  if (!url) return <Offline message="Stream is not available right now." />;

  return (
    <Frame shellRef={shellRef}>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls={false}
        autoPlay
        playsInline
        muted
        onClick={chrome.togglePlay}
        onMouseMove={chrome.bumpControls}
        onTouchStart={chrome.bumpControls}
      />
      <QuietSpinner show={overlay !== OVERLAY.NONE} />
      <PlayerChrome chrome={chrome} isLiveMode behindLive={false} lagSec={0} onGoLive={() => {}} />
    </Frame>
  );
}

function formatPartDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
  if (m > 0) return `${m}m ${String(r).padStart(2, '0')}s`;
  return `${r}s`;
}

function Mp4Player({ src, poster, eventId = '', parts = [] }) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const sortedParts = useMemo(() => {
    if (!Array.isArray(parts) || parts.length === 0) return [];
    return parts
      .slice()
      .sort((a, b) => Number(a.part || 0) - Number(b.part || 0));
  }, [parts]);
  const [partIndex, setPartIndex] = useState(0);
  const chrome = usePlayerChrome(videoRef, shellRef, { isLiveMode: false });

  useEffect(() => {
    setPartIndex(0);
  }, [eventId, sortedParts.map((p) => p.id).join(',')]);

  const activePart = sortedParts[partIndex] || null;
  const activePartId = activePart?.id || '';

  useEffect(() => {
    let cancelled = false;
    setOverlay(OVERLAY.BUFFERING);
    setResolvedSrc('');

    (async () => {
      let playSrc = src;
      if (eventId) {
        try {
          const { streamService } = await import('../../services/stream.service.js');
          const info = await streamService.resolveRecordingPlayUrl(eventId, activePartId);
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
  }, [src, eventId, activePartId]);

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
    const onEnded = () => {
      if (partIndex < sortedParts.length - 1) {
        setPartIndex((i) => i + 1);
      }
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, [resolvedSrc, partIndex, sortedParts.length]);

  if (!src && sortedParts.length === 0) return <Offline message="Recording is not available." />;

  const statusLabel =
    sortedParts.length > 1
      ? `Replay · Part ${partIndex + 1}/${sortedParts.length}`
      : 'Replay';

  return (
    <Frame shellRef={shellRef}>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls={false}
        controlsList="nodownload"
        playsInline
        poster={poster || undefined}
        onClick={chrome.togglePlay}
        onMouseMove={chrome.bumpControls}
        onTouchStart={chrome.bumpControls}
      />
      <QuietSpinner show={overlay !== OVERLAY.NONE} />
      <PlayerChrome
        chrome={chrome}
        isLiveMode={false}
        behindLive={false}
        lagSec={0}
        onGoLive={() => {}}
        statusLabel={statusLabel}
      />
      {sortedParts.length > 1 ? (
        <div className="recording-parts" role="tablist" aria-label="Recording parts">
          {sortedParts.map((p, idx) => (
            <button
              key={p.id || idx}
              type="button"
              role="tab"
              aria-selected={idx === partIndex}
              className={`recording-parts__btn ${idx === partIndex ? 'is-active' : ''}`}
              onClick={() => setPartIndex(idx)}
            >
              Part {p.part || idx + 1}
              {p.durationSec ? (
                <span className="recording-parts__dur">{formatPartDuration(p.durationSec)}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
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
  const recordingParts = Array.isArray(config.recordings) ? config.recordings : [];

  if (isMediaMtx && live) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={SERVER_WAITING_MSG} />;
    return <HlsPlayer src={playback} poster={poster} isLive detectPublish />;
  }

  if (isMediaMtx && (recordingSrc || recordingParts.length > 0)) {
    return (
      <Mp4Player
        src={recordingSrc}
        poster={poster}
        eventId={eventId}
        parts={recordingParts}
      />
    );
  }

  if (isMediaMtx) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={ENDED_MSG} />;
    return <HlsPlayer src={playback} poster={poster} isLive={false} detectPublish />;
  }

  if (!live && (recordingSrc || recordingParts.length > 0)) {
    return (
      <Mp4Player
        src={recordingSrc}
        poster={poster}
        eventId={eventId}
        parts={recordingParts}
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
