import { useEffect, useRef, useState } from 'react';
import {
  clampBackgroundMusicVolume,
  notifyLiveBackgroundMusicPlaying,
  shouldActivateLiveBackgroundMusic,
} from '../../utils/backgroundMusic.js';
import { resolveMediaUrl } from '../../utils/format.js';

/**
 * Separate HTMLAudioElement overlay for Cloudflare live pages.
 * Does not attach to the HLS <video>, DVR, or live mute/volume.
 */
export default function LiveBackgroundMusic({ config }) {
  const eligible = shouldActivateLiveBackgroundMusic(config);
  const audioRef = useRef(null);
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(() =>
    clampBackgroundMusicVolume(config?.backgroundMusicVolume)
  );

  useEffect(() => {
    setVolume(clampBackgroundMusicVolume(config?.backgroundMusicVolume));
  }, [config?.backgroundMusicVolume]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = volume;
  }, [volume, eligible]);

  useEffect(() => {
    setOn(false);
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    notifyLiveBackgroundMusicPlaying(false);
  }, [config?.backgroundMusicUrl, eligible]);

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      el?.pause();
      notifyLiveBackgroundMusicPlaying(false);
    };
  }, []);

  if (!eligible) return null;

  const src = resolveMediaUrl(config.backgroundMusicUrl);
  const title = config.backgroundMusicTitle || 'Background music';

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (on) {
      el.pause();
      setOn(false);
      notifyLiveBackgroundMusicPlaying(false);
      return;
    }
    notifyLiveBackgroundMusicPlaying(true);
    el.volume = volume;
    const playPromise = el.play?.();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => setOn(true))
        .catch(() => {
          setOn(false);
          notifyLiveBackgroundMusicPlaying(false);
        });
      return;
    }
    setOn(true);
  };

  const onVolume = (event) => {
    const next = clampBackgroundMusicVolume(event.target.value, volume);
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
  };

  return (
    <div className="elp-live-bgm" role="group" aria-label="Background music">
      <audio ref={audioRef} src={src} loop preload="none" />
      <button
        type="button"
        className={`elp-live-bgm-toggle ${on ? 'is-on' : ''}`}
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? 'Turn background music off' : 'Turn background music on'}
      >
        {on ? 'Music ON' : 'Music OFF'}
      </button>
      <label className="elp-live-bgm-volume">
        <span className="sr-only">Background music volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={onVolume}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={volume}
        />
      </label>
      <span className="elp-live-bgm-title">{title}</span>
    </div>
  );
}
