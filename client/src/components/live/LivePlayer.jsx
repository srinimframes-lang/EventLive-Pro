import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { extractYouTubeId, resolveMediaUrl } from '../../utils/format.js';
import { resolveServerPlaybackUrl } from '../../utils/streamPlayback.js';
import {
  failoverBackupVideoId,
  shouldPlayYoutubeBackup,
} from '../../utils/streamFailover.js';
import {
  clearPlaybackPosition,
  loadLiveDvrIntent,
  loadPlaybackPosition,
  loadUserStarted,
  saveLiveDvrIntent,
  savePlaybackPosition,
  saveUserStarted,
} from '../../utils/playerPrefs.js';
import {
  LIVE_PRIORITY_POLL_MS,
  isTemporaryRecordingFallback,
  probeLiveHlsPlaylist,
} from '../../utils/livePriority.js';
import '../../styles/watch-theme.css';

const RETRY_MS = 2500;
const CONTROLS_HIDE_MS = 2600;
/** Seconds behind live edge before UI shows Behind Live / GO LIVE. */
const BEHIND_LIVE_SEC = 2.5;
/** Show DVR scrub when seekable window exceeds this. */
const DVR_SCRUB_MIN_WINDOW_SEC = 2;
const DVR_SKIP_SEC = 10;
const OFFLINE_MSG = 'Live stream is currently offline.';
const SERVER_WAITING_MSG = 'Waiting for live…';
const ENDED_MSG = 'This live stream has ended.';
const RECONNECTING_MSG = 'Reconnecting…';
const LIVE_INTERRUPTED_MSG = 'Live connection interrupted.\nTrying to reconnect…';
const NEW_LIVE_MSG = 'New LIVE available';

const OVERLAY = {
  NONE: 'none',
  BUFFERING: 'buffering',
  RECONNECTING: 'reconnecting',
};

/** HLS tuned for low-bitrate / mobile stability (not LL-HLS). */
function buildHlsConfig() {
  return {
    enableWorker: true,
    lowLatencyMode: false,
    liveDurationInfinity: true,
    backBufferLength: 90,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    maxBufferSize: 60 * 1000 * 1000,
    maxBufferHole: 0.8,
    nudgeMaxRetry: 8,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    maxLiveSyncPlaybackRate: 1.1,
    startFragPrefetch: true,
    startLevel: -1, // Auto ABR
    abrEwmaDefaultEstimate: 500_000,
    abrBandWidthFactor: 0.7,
    abrBandWidthUpFactor: 0.6,
    fragLoadingTimeOut: 30000,
    manifestLoadingTimeOut: 20000,
    levelLoadingTimeOut: 20000,
    manifestLoadingMaxRetry: 8,
    levelLoadingMaxRetry: 8,
    fragLoadingMaxRetry: 10,
    fragLoadingRetryDelay: 800,
    manifestLoadingRetryDelay: 800,
  };
}

/** Quality menu labels for 2-rung ABR (and any extra levels). */
function formatQualityLabel(height, index) {
  const h = Number(height) || 0;
  if (h >= 900) return '1080p';
  if (h >= 400 && h < 900) return '480p';
  if (h > 0) return `${h}p`;
  return `Q${index + 1}`;
}

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

/** Quiet spinner — used alone or under status text. */
function QuietSpinner({ show }) {
  if (!show) return null;
  return (
    <div className="player-overlay" role="status" aria-live="polite" aria-label="Loading">
      <div className="player-overlay-spinner" aria-hidden />
    </div>
  );
}

function StatusOverlay({ show, message, spinner = true }) {
  if (!show) return null;
  const lines = String(message || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div className="player-status-overlay" role="status" aria-live="polite">
      {spinner ? <div className="player-overlay-spinner" aria-hidden /> : null}
      {lines.length > 0 ? (
        <div className="player-status-overlay__text">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ClickToPlay({ poster, onPlay, label = 'Play' }) {
  return (
    <button
      type="button"
      className="player-click-to-play"
      onClick={onPlay}
      aria-label={label}
    >
      {poster ? (
        <img src={poster} alt="" className="player-click-to-play__poster" draggable={false} />
      ) : (
        <div className="player-click-to-play__poster player-click-to-play__poster--empty" />
      )}
      <span className="player-click-to-play__veil" aria-hidden />
      <span className="player-click-to-play__btn" aria-hidden>
        <IconPlay className="h-10 w-10 sm:h-12 sm:w-12" />
      </span>
    </button>
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

function IconSkipBack() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 18V6l-8.5 6 8.5 6zm1-12v12l8.5-6L12 6z" />
    </svg>
  );
}

function IconSkipForward() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 6v12l8.5-6L13 6zM4 6v12l8.5-6L4 6z" />
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

/** True for "YouTube + Server" — public live UI must be YouTube embed, never HLS. */
function isYoutubePlusServerDestination(config) {
  const raw = String(config?.streamingDestination || config?.streamType || '')
    .toLowerCase()
    .trim()
    .replace(/[\s+]+/g, '_')
    .replace(/-/g, '_');
  if (raw === 'youtube_server') return true;
  // API also sets viewerPlayback: 'youtube' for this destination (defense in depth).
  return (
    config?.viewerPlayback === 'youtube' &&
    (raw === 'youtube_server' ||
      String(config?.streamingDestination || '')
        .toLowerCase()
        .replace(/-/g, '_') === 'youtube_server')
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
 * @param {React.MutableRefObject} videoRef
 * @param {React.MutableRefObject} shellRef
 * @param {{ isLiveMode?: boolean, onUserSeek?: (t: number) => void, mediaActive?: boolean, syncKey?: string|number, onResumeFromPause?: (video: HTMLVideoElement) => Promise<void>|void }} [options]
 */
function usePlayerChrome(videoRef, shellRef, {
  isLiveMode = false,
  onUserSeek,
  mediaActive = true,
  syncKey = 0,
  onResumeFromPause,
} = {}) {
  const [paused, setPaused] = useState(true);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekMin, setSeekMin] = useState(0);
  const [seekMax, setSeekMax] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const hideTimer = useRef(null);
  const onUserSeekRef = useRef(onUserSeek);
  onUserSeekRef.current = onUserSeek;
  const onResumeFromPauseRef = useRef(onResumeFromPause);
  onResumeFromPauseRef.current = onResumeFromPause;

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const video = videoRef.current;
    if (video && !video.paused) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    }
  }, [videoRef]);

  const syncFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setPaused(Boolean(video.paused));
    setEnded(Boolean(video.ended));
    setMuted(Boolean(video.muted));
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
    if (video.buffered && video.buffered.length > 0) {
      try {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      } catch {
        /* ignore */
      }
    }
  }, [videoRef, isLiveMode]);

  useEffect(() => {
    if (!mediaActive) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    const onPlay = () => {
      setPaused(false);
      setEnded(false);
      bumpControls();
    };
    const onPlaying = () => {
      setPaused(false);
      setEnded(false);
    };
    const onPause = () => {
      setPaused(true);
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    const onEnded = () => {
      setPaused(true);
      setEnded(true);
      setControlsVisible(true);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', syncFromVideo);
    video.addEventListener('durationchange', syncFromVideo);
    video.addEventListener('loadedmetadata', syncFromVideo);
    video.addEventListener('progress', syncFromVideo);
    video.addEventListener('volumechange', syncFromVideo);
    syncFromVideo();

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', syncFromVideo);
      video.removeEventListener('durationchange', syncFromVideo);
      video.removeEventListener('loadedmetadata', syncFromVideo);
      video.removeEventListener('progress', syncFromVideo);
      video.removeEventListener('volumechange', syncFromVideo);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [videoRef, bumpControls, mediaActive, syncKey, syncFromVideo]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setPaused(false);
      const run = async () => {
        try {
          // Live HLS: after pause the playhead is often outside the sliding window.
          // Resume must re-sync to the live edge (and restart HLS load) before play().
          if (isLiveMode && onResumeFromPauseRef.current) {
            await onResumeFromPauseRef.current(video);
          } else {
            await video.play?.();
          }
        } catch {
          setPaused(true);
        }
      };
      run();
    } else {
      setPaused(true);
      video.pause();
    }
    bumpControls();
  }, [videoRef, bumpControls, isLiveMode]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    bumpControls();
  }, [videoRef, bumpControls]);

  const seekTo = useCallback(
    (t, { user = true } = {}) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(t)) return;
      let target = t;
      if (video.seekable && video.seekable.length > 0) {
        const start = video.seekable.start(0);
        const end = video.seekable.end(video.seekable.length - 1);
        target = Math.min(Math.max(t, start), end);
      }
      try {
        video.currentTime = target;
      } catch {
        /* ignore */
      }
      if (user) onUserSeekRef.current?.(target);
      bumpControls();
    },
    [videoRef, bumpControls]
  );

  const seekBy = useCallback(
    (deltaSec) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo((video.currentTime || 0) + deltaSec, { user: true });
    },
    [videoRef, seekTo]
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

  const markMediaPlaying = useCallback(() => {
    setPaused(false);
    setEnded(false);
  }, []);

  return {
    paused,
    ended,
    muted,
    controlsVisible,
    current,
    duration,
    seekMin,
    seekMax,
    bufferedEnd,
    bumpControls,
    togglePlay,
    toggleMute,
    seekTo,
    seekBy,
    toggleFullscreen,
    setControlsVisible,
    syncFromVideo,
    markMediaPlaying,
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
  newLiveAvailable = false,
  mediaPlaying = false,
}) {
  // Hide center Play while media is confirmed playing (even if paused state is stale).
  // Show when user paused, not started, or ended.
  const showCenterPlay = (chrome.paused || chrome.ended) && !mediaPlaying;
  const showChrome = chrome.controlsVisible || showCenterPlay;
  const scrubMin = chrome.seekMin;
  const scrubMax = Math.max(chrome.seekMax, scrubMin + 0.01);
  const scrubSpan = Math.max(scrubMax - scrubMin, 0.01);
  const scrubVal = Math.min(Math.max(chrome.current, scrubMin), scrubMax);
  const playedPct = ((scrubVal - scrubMin) / scrubSpan) * 100;
  const bufferPct = Math.min(
    100,
    Math.max(0, ((Math.min(chrome.bufferedEnd || scrubMin, scrubMax) - scrubMin) / scrubSpan) * 100)
  );
  const showScrub = isLiveMode
    ? chrome.seekMax - chrome.seekMin > DVR_SCRUB_MIN_WINDOW_SEC
    : chrome.duration > 0 || chrome.seekMax > 0;

  return (
    <>
      {showCenterPlay && (
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
            {isLiveMode && !behindLive && (
              <span className="elp-live-pill elp-live-pill-on" title="Watching live">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                LIVE
              </span>
            )}
            {isLiveMode && behindLive && (
              <span className="elp-status-chip" title={`${formatClock(lagSec)} behind live`}>
                Behind Live · −{formatClock(lagSec)}
              </span>
            )}
            {isLiveMode && behindLive && newLiveAvailable && (
              <span className="elp-new-live-chip">{NEW_LIVE_MSG}</span>
            )}
            {statusLabel && <span className="elp-status-chip">{statusLabel}</span>}
            {isLiveMode && behindLive && (
              <button type="button" className="elp-go-live-btn" onClick={onGoLive}>
                GO LIVE
              </button>
            )}
          </div>
        </div>

        <div className="flex-1" onClick={chrome.togglePlay} onDoubleClick={chrome.toggleFullscreen} />

        <div className="elp-player-gradient-bottom">
          {showScrub && (
            <div className="elp-player-scrub-wrap mb-2">
              <div className="elp-player-scrub-track" aria-hidden>
                <div className="elp-player-scrub-buffer" style={{ width: `${bufferPct}%` }} />
                <div className="elp-player-scrub-played" style={{ width: `${playedPct}%` }} />
              </div>
              <input
                type="range"
                className="elp-player-scrub"
                min={scrubMin}
                max={scrubMax}
                step="any"
                value={scrubVal}
                aria-label={isLiveMode ? 'Seek in live DVR timeline' : 'Seek'}
                onChange={(e) => chrome.seekTo(Number(e.target.value), { user: true })}
                onPointerDown={chrome.bumpControls}
              />
            </div>
          )}
          <div className="elp-player-bar">
            <button type="button" className="elp-player-btn" aria-label={chrome.paused ? 'Play' : 'Pause'} onClick={chrome.togglePlay}>
              {chrome.paused ? <IconPlay /> : <IconPause />}
            </button>

            {isLiveMode && showScrub && (
              <>
                <button
                  type="button"
                  className="elp-player-btn elp-skip-btn"
                  aria-label={`Back ${DVR_SKIP_SEC} seconds`}
                  onClick={() => chrome.seekBy(-DVR_SKIP_SEC)}
                >
                  <IconSkipBack />
                  <span className="elp-skip-label">10</span>
                </button>
                <button
                  type="button"
                  className="elp-player-btn elp-skip-btn"
                  aria-label={`Forward ${DVR_SKIP_SEC} seconds`}
                  onClick={() => chrome.seekBy(DVR_SKIP_SEC)}
                >
                  <IconSkipForward />
                  <span className="elp-skip-label">10</span>
                </button>
              </>
            )}

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
              <button type="button" className="elp-go-live-btn elp-go-live-btn--bar" onClick={onGoLive}>
                GO LIVE
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
                      {formatQualityLabel(l.height, l.index)}
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

function HlsPlayer({
  src,
  poster,
  isLive = true,
  detectPublish = false,
  eventId = '',
  reconnecting = false,
}) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimer = useRef(null);
  const dvrTimer = useRef(null);
  const posSaveTimer = useRef(null);
  const restoredPosRef = useRef(false);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const hasPlayedRef = useRef(false);
  const [playbackHealthy, setPlaybackHealthy] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [behindLive, setBehindLive] = useState(false);
  const [lagSec, setLagSec] = useState(0);
  const [newLiveAvailable, setNewLiveAvailable] = useState(false);
  const [userStarted, setUserStarted] = useState(() => loadUserStarted(eventId));
  const dvrIntentRef = useRef(loadLiveDvrIntent(eventId));

  const markDvrIntent = useCallback(
    (intent) => {
      const next = intent === 'dvr' ? 'dvr' : 'live';
      dvrIntentRef.current = next;
      saveLiveDvrIntent(eventId, next);
      if (next === 'live') setNewLiveAvailable(false);
    },
    [eventId]
  );

  const handleUserSeek = useCallback(() => {
    markDvrIntent('dvr');
  }, [markDvrIntent]);

  const markMediaPlayingRef = useRef(null);
  const syncFromVideoRef = useRef(null);
  const intentionalPauseRef = useRef(false);

  const seekVideoToLiveEdge = useCallback((video, hls) => {
    let target = null;
    if (hls && Number.isFinite(hls.liveSyncPosition)) {
      target = hls.liveSyncPosition;
    } else if (video?.seekable && video.seekable.length > 0) {
      target = Math.max(0, video.seekable.end(video.seekable.length - 1) - 0.25);
    }
    if (target != null && Number.isFinite(target)) {
      try {
        video.currentTime = target;
      } catch {
        /* ignore seek race */
      }
      return true;
    }
    return false;
  }, []);

  /**
   * Resume after user pause: restart HLS loading, jump to live edge, play.
   * Preserves mute/volume (fullscreen is on the shell — untouched).
   */
  const resumeLivePlayback = useCallback(
    async (video) => {
      if (!video) return;
      intentionalPauseRef.current = false;

      const wasMuted = video.muted;
      const wasVolume = video.volume;
      const hls = hlsRef.current;

      markDvrIntent('live');
      clearPlaybackPosition(eventId, 'live');
      setBehindLive(false);
      setLagSec(0);
      setNewLiveAvailable(false);
      setOverlay(OVERLAY.BUFFERING);
      setPlaybackHealthy(false);

      if (hls) {
        try {
          // Resume fragment/playlist loading after pause (live window moves on).
          hls.startLoad();
        } catch {
          /* ignore */
        }
        try {
          if (video.error) hls.recoverMediaError();
        } catch {
          /* ignore */
        }

        // Allow liveSyncPosition to refresh after startLoad.
        await new Promise((r) => setTimeout(r, 80));

        let edged = seekVideoToLiveEdge(video, hls);
        if (!edged && src) {
          // Soft playlist refresh without destroying the player shell / chrome state.
          try {
            hls.loadSource(src);
            hls.startLoad(-1);
          } catch {
            /* ignore */
          }
          await new Promise((r) => setTimeout(r, 120));
          edged = seekVideoToLiveEdge(video, hls);
        }
      } else {
        // Safari native HLS
        let edged = seekVideoToLiveEdge(video, null);
        if (!edged && src) {
          const keepSrc = video.currentSrc || src;
          try {
            video.src = keepSrc;
            video.load();
          } catch {
            /* ignore */
          }
          await new Promise((resolve) => {
            const done = () => {
              video.removeEventListener('loadedmetadata', done);
              resolve();
            };
            video.addEventListener('loadedmetadata', done, { once: true });
            setTimeout(resolve, 1500);
          });
          seekVideoToLiveEdge(video, null);
        }
      }

      // Restore A/V prefs (never leave unmuted state changed by autoplay policies silently).
      video.muted = wasMuted;
      try {
        video.volume = wasVolume;
      } catch {
        /* ignore */
      }

      await video.play();
      hasPlayedRef.current = true;
      markMediaPlayingRef.current?.();
      setPlaybackHealthy(true);
      setOverlay(OVERLAY.NONE);
      syncFromVideoRef.current?.();
    },
    [eventId, src, markDvrIntent, seekVideoToLiveEdge]
  );

  const chrome = usePlayerChrome(videoRef, shellRef, {
    isLiveMode: true,
    onUserSeek: handleUserSeek,
    mediaActive: userStarted,
    syncKey: reloadKey,
    onResumeFromPause: resumeLivePlayback,
  });
  markMediaPlayingRef.current = chrome.markMediaPlaying;
  syncFromVideoRef.current = chrome.syncFromVideo;

  useEffect(() => {
    setUserStarted(loadUserStarted(eventId));
    restoredPosRef.current = false;
    setPlaybackHealthy(false);
    dvrIntentRef.current = loadLiveDvrIntent(eventId);
  }, [eventId]);

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
    setPlaybackHealthy(true);
  }, [clearRetry]);

  const markPlaying = useCallback(() => {
    hasPlayedRef.current = true;
    // Keep center Play in sync with HTML5/HLS playing (fixes stale paused=true).
    markMediaPlayingRef.current?.();
    hideOverlay();
  }, [hideOverlay]);

  // When user pauses, drop "playing" health so center Play can show again.
  useEffect(() => {
    if (!userStarted) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    const onPause = () => {
      intentionalPauseRef.current = true;
      setPlaybackHealthy(false);
      syncFromVideoRef.current?.();
    };
    const onPlaying = () => {
      intentionalPauseRef.current = false;
      markMediaPlayingRef.current?.();
      setPlaybackHealthy(true);
      setOverlay(OVERLAY.NONE);
    };
    video.addEventListener('pause', onPause);
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('pause', onPause);
      video.removeEventListener('playing', onPlaying);
    };
  }, [userStarted, reloadKey]);

  const showOverlayIfNotPlaying = useCallback((state) => {
    if (hasPlayedRef.current && isActivelyPlaying(videoRef.current)) return;
    setPlaybackHealthy(false);
    setOverlay(state);
  }, []);

  const scheduleRetry = useCallback(() => {
    clearRetry();
    setPlaybackHealthy(false);
    setOverlay(OVERLAY.RECONNECTING);
    retryTimer.current = setTimeout(() => {
      setReloadKey((k) => k + 1);
    }, RETRY_MS);
  }, [clearRetry]);

  // When parent clears reconnecting (LIVE confirmed), drop stale overlay if media is playing.
  useEffect(() => {
    if (reconnecting) return undefined;
    if (isActivelyPlaying(videoRef.current) || hasPlayedRef.current) {
      hideOverlay();
    }
    return undefined;
  }, [reconnecting, hideOverlay]);

  const handleFirstPlay = useCallback(() => {
    setUserStarted(true);
    saveUserStarted(eventId);
    restoredPosRef.current = false;
    setReloadKey((k) => k + 1);
  }, [eventId]);

  const jumpToLive = useCallback(() => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    if (!video) return;
    intentionalPauseRef.current = false;
    markDvrIntent('live');
    clearPlaybackPosition(eventId, 'live');
    setNewLiveAvailable(false);
    try {
      hls?.startLoad?.();
    } catch {
      /* ignore */
    }
    seekVideoToLiveEdge(video, hls);
    video.play?.().catch(() => {});
    setBehindLive(false);
    setLagSec(0);
    markMediaPlayingRef.current?.();
    setPlaybackHealthy(true);
    chrome.bumpControls();
  }, [chrome, eventId, markDvrIntent, seekVideoToLiveEdge]);

  const tryRestoreOrLive = useCallback(
    (video, hls) => {
      if (!video || restoredPosRef.current) return;
      restoredPosRef.current = true;

      const preferDvr = dvrIntentRef.current === 'dvr';
      const seekable = video.seekable;
      const liveEdge =
        hls && Number.isFinite(hls.liveSyncPosition)
          ? hls.liveSyncPosition
          : seekable && seekable.length > 0
            ? seekable.end(seekable.length - 1)
            : null;

      // Intentional DVR: restore position; do not force LIVE edge.
      if (preferDvr) {
        const saved = loadPlaybackPosition(eventId, 'live');
        if (
          saved != null &&
          seekable &&
          seekable.length > 0
        ) {
          const start = seekable.start(0);
          const end = seekable.end(seekable.length - 1);
          if (saved >= start && saved <= end) {
            try {
              video.currentTime = saved;
            } catch {
              /* ignore */
            }
            if (liveEdge != null && liveEdge - saved > BEHIND_LIVE_SEC) {
              setNewLiveAvailable(true);
            }
            return;
          }
        }
        // Saved position expired from DVR window — stay near start of window.
        if (seekable && seekable.length > 0) {
          try {
            video.currentTime = seekable.start(0);
          } catch {
            /* ignore */
          }
          setNewLiveAvailable(true);
          return;
        }
      }

      // Follow LIVE (default / at-edge viewers) — same as production today.
      if (liveEdge != null) {
        try {
          video.currentTime = liveEdge;
        } catch {
          /* ignore */
        }
      }
      setNewLiveAvailable(false);
    },
    [eventId]
  );

  useEffect(() => {
    if (!userStarted) return undefined;
    if (!detectPublish && !isLive) return undefined;
    const video = videoRef.current;
    if (!video || !src) return undefined;

    setShowOffline(false);
    hasPlayedRef.current = false;
    restoredPosRef.current = false;
    setPlaybackHealthy(false);
    setOverlay(OVERLAY.BUFFERING);
    setBehindLive(false);
    setLagSec(0);

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
      const behind = lag > BEHIND_LIVE_SEC;
      setBehindLive(behind);
      // Catching up to the live edge clears DVR intent automatically.
      if (!behind && dvrIntentRef.current === 'dvr' && !video.paused) {
        markDvrIntent('live');
      }
      if (behind && dvrIntentRef.current === 'dvr') {
        setNewLiveAvailable(true);
      }
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      useNative = true;
      video.src = src;
      video.load();
      const onMeta = () => {
        tryRestoreOrLive(video, null);
        video.play?.().catch(() => {});
      };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
      video.play?.().catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls(buildHlsConfig());
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const lvls = (data.levels || []).map((l, index) => ({ index, height: l.height || 0 }));
        setLevels(lvls);
        tryRestoreOrLive(video, hls);
        video.play?.().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (hlsRef.current) setCurrentLevel(hlsRef.current.autoLevelEnabled ? -1 : data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        // After first successful play: reconnect overlay + remount (no second Play click).
        if (hasPlayedRef.current) {
          setShowOffline(false);
          setOverlay(OVERLAY.RECONNECTING);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              try {
                hls.startLoad();
              } catch {
                /* remount below */
              }
              scheduleRetry();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              try {
                hls.recoverMediaError();
              } catch {
                /* remount below */
              }
              scheduleRetry();
              break;
            default:
              try {
                hls.destroy();
              } catch {
                /* ignore */
              }
              hlsRef.current = null;
              scheduleRetry();
          }
          return;
        }
        // Pre-first-play: keep detectPublish waiting behavior.
        showOverlayIfNotPlaying(OVERLAY.RECONNECTING);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (detectPublish) setShowOffline(true);
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
            try {
              hls.destroy();
            } catch {
              /* ignore */
            }
            hlsRef.current = null;
            if (detectPublish) setShowOffline(true);
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
    const recoverStall = () => {
      // User intentionally paused — do not auto-resume.
      if (intentionalPauseRef.current || video.paused) return;
      if (!hasPlayedRef.current) return;
      setOverlay(OVERLAY.BUFFERING);
      const h = hlsRef.current;
      try {
        h?.startLoad?.();
      } catch {
        /* ignore */
      }
      seekVideoToLiveEdge(video, h);
      video.play?.().catch(() => {});
    };
    const onWaiting = () => {
      if (intentionalPauseRef.current || video.paused) return;
      if (hasPlayedRef.current && isActivelyPlaying(video)) return;
      if (hasPlayedRef.current) setOverlay(OVERLAY.BUFFERING);
    };
    const onStalled = () => {
      recoverStall();
    };
    const onTimeUpdate = () => {
      if (video.currentTime > 0) markPlaying();
      refreshDvrState();
      if (posSaveTimer.current) return;
      posSaveTimer.current = setTimeout(() => {
        posSaveTimer.current = null;
        const t = video.currentTime;
        if (Number.isFinite(t) && t > 1) savePlaybackPosition(eventId, t, 'live');
      }, 2000);
    };
    const onSeeked = () => refreshDvrState();
    const onVideoError = () => {
      if (useNative) {
        if (detectPublish && !hasPlayedRef.current) setShowOffline(true);
        else setOverlay(OVERLAY.RECONNECTING);
        scheduleRetry();
      }
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
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
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onVideoError);
      if (dvrTimer.current) {
        clearInterval(dvrTimer.current);
        dvrTimer.current = null;
      }
      if (posSaveTimer.current) {
        clearTimeout(posSaveTimer.current);
        posSaveTimer.current = null;
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
    userStarted,
    src,
    reloadKey,
    isLive,
    detectPublish,
    eventId,
    scheduleRetry,
    clearRetry,
    markPlaying,
    showOverlayIfNotPlaying,
    tryRestoreOrLive,
    markDvrIntent,
    seekVideoToLiveEdge,
  ]);

  const pickLevel = (index) => {
    setCurrentLevel(index);
    if (hlsRef.current) hlsRef.current.currentLevel = index;
    chrome.bumpControls();
  };

  if (!detectPublish && !isLive) return <Offline message={SERVER_WAITING_MSG} />;
  if (!src) return <Offline message={SERVER_WAITING_MSG} />;

  if (!userStarted) {
    return (
      <Frame shellRef={shellRef}>
        <ClickToPlay poster={poster} onPlay={handleFirstPlay} />
      </Frame>
    );
  }

  // Never keep "Reconnecting..." once media is healthy — even if a stale
  // reconnecting prop arrives from socket/API lag.
  const showReconnecting =
    !showOffline &&
    !playbackHealthy &&
    (reconnecting || overlay === OVERLAY.RECONNECTING);
  const showBuffering =
    overlay === OVERLAY.BUFFERING && !showOffline && !showReconnecting && !playbackHealthy;

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
      <StatusOverlay show={showReconnecting} message={RECONNECTING_MSG} />
      <StatusOverlay show={showBuffering} />
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
          newLiveAvailable={newLiveAvailable}
          mediaPlaying={Boolean(playbackHealthy && !chrome.ended)}
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

function Mp4Player({ src, poster, eventId = '', parts = [], awaitingLiveResume = false }) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const posSaveTimer = useRef(null);
  const restoredPosRef = useRef(false);
  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [userStarted, setUserStarted] = useState(() => loadUserStarted(eventId));
  const sortedParts = useMemo(() => {
    if (!Array.isArray(parts) || parts.length === 0) return [];
    return parts
      .slice()
      .sort((a, b) => Number(a.part || 0) - Number(b.part || 0));
  }, [parts]);
  const partsKey = useMemo(
    () => sortedParts.map((p) => p.id).join(','),
    [sortedParts]
  );
  const [partIndex, setPartIndex] = useState(0);
  const chrome = usePlayerChrome(videoRef, shellRef, {
    isLiveMode: false,
    mediaActive: userStarted,
  });

  useEffect(() => {
    setUserStarted(loadUserStarted(eventId));
  }, [eventId]);

  useEffect(() => {
    setPartIndex(0);
  }, [eventId, partsKey]);

  const activePart = sortedParts[partIndex] || null;
  const activePartId = activePart?.id || '';

  const handleFirstPlay = useCallback(() => {
    setUserStarted(true);
    saveUserStarted(eventId);
    restoredPosRef.current = false;
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    setOverlay(OVERLAY.BUFFERING);
    setResolvedSrc('');
    restoredPosRef.current = false;

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
    if (!userStarted) return undefined;
    const video = videoRef.current;
    if (!video || !resolvedSrc) return undefined;
    setOverlay(OVERLAY.BUFFERING);
    video.src = resolvedSrc;
    video.load();

    const restoreAndPlay = () => {
      if (!restoredPosRef.current) {
        restoredPosRef.current = true;
        const saved = loadPlaybackPosition(eventId, 'replay', activePartId);
        if (saved != null) {
          const dur = Number.isFinite(video.duration) ? video.duration : 0;
          const seekable = video.seekable;
          let inRange = false;
          if (seekable && seekable.length > 0) {
            const start = seekable.start(0);
            const end = seekable.end(seekable.length - 1);
            inRange = saved >= start && saved <= end;
          } else if (dur > 0) {
            inRange = saved > 0 && saved < dur - 0.5;
          }
          if (inRange) {
            try {
              video.currentTime = saved;
            } catch {
              /* ignore */
            }
          }
        }
      }
      video.play?.().catch(() => {});
    };

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
    const onTimeUpdate = () => {
      if (posSaveTimer.current) return;
      posSaveTimer.current = setTimeout(() => {
        posSaveTimer.current = null;
        const t = video.currentTime;
        if (Number.isFinite(t) && t > 1) {
          savePlaybackPosition(eventId, t, 'replay', activePartId);
        }
      }, 2000);
    };

    video.addEventListener('loadedmetadata', restoreAndPlay, { once: true });
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    // Kick play if metadata already available.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) restoreAndPlay();

    return () => {
      video.removeEventListener('loadedmetadata', restoreAndPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      if (posSaveTimer.current) {
        clearTimeout(posSaveTimer.current);
        posSaveTimer.current = null;
      }
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, [userStarted, resolvedSrc, partIndex, sortedParts.length, eventId, activePartId]);

  if (!src && sortedParts.length === 0) return <Offline message="Recording is not available." />;

  if (!userStarted) {
    return (
      <Frame shellRef={shellRef}>
        <ClickToPlay poster={poster} onPlay={handleFirstPlay} />
      </Frame>
    );
  }

  const statusLabel = awaitingLiveResume
    ? 'Reconnecting…'
    : sortedParts.length > 1
      ? `Replay · Part ${partIndex + 1}/${sortedParts.length}`
      : 'Replay';

  const showInterrupted = awaitingLiveResume;
  const showReconnecting = !showInterrupted && overlay === OVERLAY.RECONNECTING;
  const showBuffering = overlay === OVERLAY.BUFFERING && !showInterrupted;

  return (
    <Frame shellRef={shellRef}>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls={false}
        controlsList="nodownload"
        playsInline
        autoPlay
        poster={poster || undefined}
        onClick={chrome.togglePlay}
        onMouseMove={chrome.bumpControls}
        onTouchStart={chrome.bumpControls}
      />
      <StatusOverlay show={showInterrupted} message={LIVE_INTERRUPTED_MSG} />
      <StatusOverlay show={showReconnecting} message={RECONNECTING_MSG} />
      <StatusOverlay show={showBuffering && !showReconnecting} />
      <PlayerChrome
        chrome={chrome}
        isLiveMode={false}
        behindLive={false}
        lagSec={0}
        onGoLive={() => {}}
        statusLabel={statusLabel}
      />
      {!awaitingLiveResume && sortedParts.length > 1 ? (
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
 * LIVE HLS always wins over recording parts; parts are temporary fallback only.
 *
 * @param {{ config: object, onLiveUiChange?: (state: { isLive: boolean, reconnecting: boolean }) => void }} props
 */
export default function LivePlayer({ config, onLiveUiChange }) {
  const [hlsLiveResume, setHlsLiveResume] = useState(false);

  useEffect(() => {
    if (!config) {
      setHlsLiveResume(false);
      return;
    }
    // YouTube + Server never uses HLS live resume.
    if (isYoutubePlusServerDestination(config)) {
      setHlsLiveResume(false);
      return;
    }
    // Parent/API confirmed LIVE — drop local override (player already on HLS).
    if (config.isLive) setHlsLiveResume(false);
  }, [config]);

  // While recording parts play (or local LIVE resume), re-check HLS every 3s.
  // Never cache "parts forever" — if LIVE playlist returns, switch immediately.
  // Skipped entirely for YouTube + Server (embed-only live playback).
  useEffect(() => {
    if (!config) return undefined;
    if (isYoutubePlusServerDestination(config)) {
      setHlsLiveResume(false);
      return undefined;
    }
    if (config.isLive) return undefined;
    const isMediaMtx = config.provider === 'rtmp' || config.provider === 'hls';
    if (!isMediaMtx) return undefined;
    const hasParts =
      Boolean(config.recordingUrl) ||
      (Array.isArray(config.recordings) && config.recordings.length > 0);
    if (!hasParts && !hlsLiveResume) return undefined;

    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return undefined;

    let cancelled = false;
    let failStreak = 0;
    const tick = async () => {
      const ok = await probeLiveHlsPlaylist(playback);
      if (cancelled) return;
      if (ok) {
        failStreak = 0;
        setHlsLiveResume(true);
        return;
      }
      failStreak += 1;
      // Require two misses so a single flaky fetch doesn't bounce off LIVE.
      if (hlsLiveResume && failStreak >= 2) setHlsLiveResume(false);
    };
    tick();
    const timer = setInterval(tick, LIVE_PRIORITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [config, hlsLiveResume]);

  const youtubePlusServer = isYoutubePlusServerDestination(config);
  // Never treat HLS resume as "live" for YouTube + Server — that would flip into HlsPlayer.
  const live = youtubePlusServer
    ? Boolean(config?.isLive)
    : Boolean(config?.isLive) || hlsLiveResume;
  // HLS probe confirmation clears reconnect UI immediately. Server grace flag may
  // still be true — HlsPlayer hides overlay once media is actually playing.
  const reconnecting = hlsLiveResume && !youtubePlusServer ? false : Boolean(config?.reconnecting);

  useEffect(() => {
    if (!onLiveUiChange) return undefined;
    onLiveUiChange({ isLive: live, reconnecting: live ? false : reconnecting });
    return undefined;
  }, [live, reconnecting, onLiveUiChange]);

  if (!config) {
    return <Frame />;
  }

  if (config.streamDisabled) {
    return <Offline message="This live stream has been disabled." />;
  }

  const videoId = resolveYoutubeVideoId(config);
  const isServerProvider =
    config.provider === 'rtmp' || config.provider === 'hls' || config.provider === 'webrtc';

  // Feature-flagged failover: only when server sends failoverFeatureEnabled.
  // When FAILOVER_ENABLED=false the API omits that flag — this branch never runs.
  if (shouldPlayYoutubeBackup(config)) {
    const backupId = failoverBackupVideoId(config, extractYouTubeId);
    if (backupId) return <YouTubePlayer videoId={backupId} />;
  }

  const { provider } = config;
  const poster = config.poster || '';
  const isMediaMtx = provider === 'rtmp' || provider === 'hls';
  const recordingSrc = resolveMediaUrl(config.recordingUrl || '');
  const eventId = config.eventId || '';
  const recordingParts = Array.isArray(config.recordings) ? config.recordings : [];
  const hasServerReplay = Boolean(recordingSrc || recordingParts.length > 0);
  const awaitingLiveResume =
    isTemporaryRecordingFallback({
      ...config,
      isLive: live,
    }) && !live;

  // ── YouTube + Server ──────────────────────────────────────────────
  // Live / waiting: YouTube embed ONLY (never Server HLS).
  // Offline with recordings: server Mp4 replay (unchanged recording pipeline).
  if (youtubePlusServer) {
    if (!live && hasServerReplay) {
      return (
        <Mp4Player
          src={recordingSrc}
          poster={poster}
          eventId={eventId}
          parts={recordingParts}
          awaitingLiveResume={awaitingLiveResume}
        />
      );
    }
    if (videoId) {
      return <YouTubePlayer videoId={videoId} />;
    }
    return (
      <Offline message="YouTube embed URL is missing for this YouTube + Server event." />
    );
  }

  const isYoutube = !isServerProvider && (config.provider === 'youtube' || Boolean(videoId));

  if (isYoutube) {
    return <YouTubePlayer videoId={videoId} />;
  }

  if (isMediaMtx && live) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={SERVER_WAITING_MSG} />;
    return (
      <HlsPlayer
        key={`live-${eventId}-${hlsLiveResume ? 'resume' : 'cfg'}`}
        src={playback}
        poster={poster}
        isLive
        detectPublish
        eventId={eventId}
        reconnecting={reconnecting}
      />
    );
  }

  if (isMediaMtx && hasServerReplay) {
    return (
      <Mp4Player
        src={recordingSrc}
        poster={poster}
        eventId={eventId}
        parts={recordingParts}
        awaitingLiveResume={awaitingLiveResume}
      />
    );
  }

  if (isMediaMtx) {
    const playback = resolveServerPlaybackUrl(config);
    if (!playback) return <Offline message={ENDED_MSG} />;
    return (
      <HlsPlayer
        src={playback}
        poster={poster}
        isLive={false}
        detectPublish
        eventId={eventId}
        reconnecting={reconnecting}
      />
    );
  }

  if (!live && hasServerReplay) {
    return (
      <Mp4Player
        src={recordingSrc}
        poster={poster}
        eventId={eventId}
        parts={recordingParts}
        awaitingLiveResume={awaitingLiveResume}
      />
    );
  }

  if (!live) {
    return <Offline message={OFFLINE_MSG} />;
  }

  const playback = resolveServerPlaybackUrl(config) || config.playbackUrl || config.hlsUrl;
  if (provider === 'hls') {
    return (
      <HlsPlayer
        src={playback}
        poster={poster}
        isLive={live}
        eventId={eventId}
        reconnecting={reconnecting}
      />
    );
  }
  if (provider === 'webrtc') return <WebRtcPlayer url={config.webrtcUrl} isLive={live} />;

  return <Offline message="Live stream is not configured yet." />;
}
