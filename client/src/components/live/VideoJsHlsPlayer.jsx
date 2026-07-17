import { useCallback, useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import Hls from 'hls.js';
import 'video.js/dist/video-js.css';
import '../../styles/videojs-hls-player.css';

const RETRY_MS = 3000;
const WAITING_MSG = 'Waiting for live stream...';

const OVERLAY = {
  NONE: 'none',
  BUFFERING: 'buffering',
  RECONNECTING: 'reconnecting',
};

let qualityMenuRegistered = false;

function registerQualityMenu() {
  if (qualityMenuRegistered) return;
  qualityMenuRegistered = true;

  const MenuButton = videojs.getComponent('MenuButton');
  const MenuItem = videojs.getComponent('MenuItem');

  class QualityMenuItem extends MenuItem {
    constructor(player, options) {
      super(player, options);
      this.levelIndex = options.levelIndex;
      this.selectable = true;
    }

    handleClick() {
      this.player().trigger('hlsqualitychange', { level: this.levelIndex });
    }
  }

  class QualityMenuButton extends MenuButton {
    constructor(player, options) {
      super(player, options);
      this.controlText('Quality');
      this.addClass('vjs-quality-menu');
      this.levels_ = [];
      this.currentLevel_ = -1;

      player.on('hlslevelsupdated', (_e, data) => {
        this.levels_ = data.levels || [];
        this.currentLevel_ = data.currentLevel ?? -1;
        this.update();
      });
      player.on('hlsqualitychange', (_e, data) => {
        this.currentLevel_ = data.level ?? -1;
        this.update();
      });
    }

    createItems() {
      const items = [
        new QualityMenuItem(this.player(), {
          label: 'Auto',
          levelIndex: -1,
          selected: this.currentLevel_ === -1,
        }),
      ];

      this.levels_
        .slice()
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .forEach((level) => {
          const label = level.height ? `${level.height}p` : `Quality ${level.index + 1}`;
          items.push(
            new QualityMenuItem(this.player(), {
              label,
              levelIndex: level.index,
              selected: this.currentLevel_ === level.index,
            })
          );
        });

      return items;
    }
  }

  videojs.registerComponent('QualityMenuButton', QualityMenuButton);
}

function Frame({ children }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
      {children}
    </div>
  );
}

function PlayerOverlay({ state }) {
  if (state === OVERLAY.NONE) return null;

  const isBuffering = state === OVERLAY.BUFFERING;
  const title = isBuffering ? 'Network is slow.' : 'Reconnecting to the live stream...';
  const subtitle = isBuffering ? 'Please wait while we reconnect to the live stream...' : '';

  return (
    <div className="player-overlay vjs-player-overlay" role="status" aria-live="polite">
      <div className="player-overlay-panel">
        <div className="player-overlay-spinner" aria-hidden />
        <p className="player-overlay-title">
          <span aria-hidden>{isBuffering ? '📶' : '🔄'}</span> {title}
        </p>
        {subtitle && <p className="player-overlay-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * Professional Video.js shell with Hls.js for Premium Server Live (MediaMTX).
 */
export default function VideoJsHlsPlayer({ src, poster, isLive = true, detectPublish = false }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimer = useRef(null);
  const hasPlayedRef = useRef(false);

  const [overlay, setOverlay] = useState(OVERLAY.BUFFERING);
  const [showOffline, setShowOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const clearRetry = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const hideOverlay = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setShowOffline(false);
    setOverlay(OVERLAY.NONE);
  }, []);

  const markPlaying = useCallback(() => {
    hasPlayedRef.current = true;
    hideOverlay();
  }, [hideOverlay]);

  const scheduleRetry = useCallback(() => {
    clearRetry();
    setOverlay(OVERLAY.RECONNECTING);
    retryTimer.current = setTimeout(() => {
      setReloadKey((k) => k + 1);
    }, RETRY_MS);
  }, [clearRetry]);

  useEffect(() => {
    registerQualityMenu();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const videoEl = document.createElement('video');
    videoEl.className = 'video-js vjs-big-play-centered vjs-elpro-live';
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(videoEl);

    const player = videojs(videoEl, {
      controls: true,
      autoplay: true,
      muted: true,
      playsinline: true,
      fluid: true,
      responsive: true,
      liveui: true,
      preload: 'auto',
      poster: poster || undefined,
      controlBar: {
        volumePanel: { inline: false },
        pictureInPictureToggle: false,
        remainingTimeDisplay: false,
      },
      html5: {
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    playerRef.current = player;

    player.ready(() => {
      const controlBar = player.getChild('controlBar');
      if (controlBar && !controlBar.getChild('QualityMenuButton')) {
        const fullscreen = controlBar.getChild('fullscreenToggle');
        const qualityBtn = controlBar.addChild('QualityMenuButton', {}, fullscreen ? 6 : undefined);
        qualityBtn.hide();
        player.qualityButton = qualityBtn;
      }
      if (controlBar?.progressControl) {
        controlBar.progressControl.disable();
      }
    });

    const onPlaying = () => markPlaying();
    const onCanPlay = () => hideOverlay();
    const onError = () => {
      if (detectPublish && !hasPlayedRef.current) setShowOffline(true);
      scheduleRetry();
    };
    const onQualityChange = (_e, data) => {
      const hls = hlsRef.current;
      if (!hls) return;
      const level = data.level ?? -1;
      hls.currentLevel = level;
      player.trigger('hlslevelsupdated', {
        levels: (hls.levels || []).map((l, index) => ({ index, height: l.height || 0 })),
        currentLevel: level,
      });
    };

    player.on('playing', onPlaying);
    player.on('canplay', onCanPlay);
    player.on('error', onError);
    player.on('hlsqualitychange', onQualityChange);

    return () => {
      player.off('playing', onPlaying);
      player.off('canplay', onCanPlay);
      player.off('error', onError);
      player.off('hlsqualitychange', onQualityChange);
      clearRetry();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
    // Player shell is created once per mount; stream URL reloads separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (player && poster) player.poster(poster);
  }, [poster]);

  useEffect(() => {
    if (!detectPublish && !isLive) return undefined;

    const player = playerRef.current;
    if (!player || !src) return undefined;

    let cancelled = false;
    let cleanupStream = () => {};

    const attachStream = () => {
      if (cancelled) return;

      setShowOffline(false);
      hasPlayedRef.current = false;
      setOverlay(OVERLAY.BUFFERING);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const videoEl = player.tech({ IWillNotUseThisInPlugins: true }).el();
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

      const updateQualityMenu = (levels, currentLevel) => {
        player.trigger('hlslevelsupdated', { levels, currentLevel });
        if (player.qualityButton) {
          if (levels.length > 1) player.qualityButton.show();
          else player.qualityButton.hide();
        }
      };

      let useNative = false;

      if (videoEl.canPlayType('application/vnd.apple.mpegurl') && !Hls.isSupported()) {
        useNative = true;
        player.src({ src, type: 'application/x-mpegURL' });
        player.play()?.catch(() => {});
      } else if (Hls.isSupported()) {
        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(videoEl);

        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          const levels = (data.levels || []).map((l, index) => ({
            index,
            height: l.height || 0,
          }));
          updateQualityMenu(levels, hls.currentLevel);
          hideOverlay();
          player.play()?.catch(() => {});
        });

        hls.on(Hls.Events.LEVEL_LOADED, () => {
          hideOverlay();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          if (!hlsRef.current) return;
          const currentLevel = hlsRef.current.autoLevelEnabled ? -1 : data.level;
          const levels = (hlsRef.current.levels || []).map((l, index) => ({
            index,
            height: l.height || 0,
          }));
          updateQualityMenu(levels, currentLevel);
        });

        hls.on(Hls.Events.ERROR, (_e, data) => {
          // Only surface real buffering / network problems — ignore routine LL-HLS noise.
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

      const onPlaying = () => markPlaying();
      const onCanPlay = () => hideOverlay();
      videoEl.addEventListener('playing', onPlaying);
      videoEl.addEventListener('canplay', onCanPlay);

      cleanupStream = () => {
        videoEl.removeEventListener('playing', onPlaying);
        videoEl.removeEventListener('canplay', onCanPlay);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        if (useNative) player.reset();
      };
    };

    if (player.isReady_) {
      attachStream();
    } else {
      player.ready(attachStream);
    }

    return () => {
      cancelled = true;
      cleanupStream();
    };
  }, [src, reloadKey, isLive, detectPublish, scheduleRetry, hideOverlay, markPlaying]);

  if (!detectPublish && !isLive) {
    return (
      <Frame>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center text-white">
          <p className="text-lg font-bold sm:text-xl">{WAITING_MSG}</p>
        </div>
      </Frame>
    );
  }

  if (!src) {
    return (
      <Frame>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center text-white">
          <p className="text-lg font-bold sm:text-xl">{WAITING_MSG}</p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="vjs-hls-player-shell absolute inset-0">
        <div ref={containerRef} data-vjs-player className="h-full w-full" />
      </div>

      {showOffline && overlay === OVERLAY.NONE && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 px-6 text-center text-white">
          <div className="mb-4 h-12 w-12 animate-pulse rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-lg font-bold leading-snug sm:text-xl">{WAITING_MSG}</p>
          <p className="mt-2 text-sm text-white/70">The stream will start automatically when the broadcaster goes live.</p>
        </div>
      )}

      <PlayerOverlay state={overlay} />
    </Frame>
  );
}
