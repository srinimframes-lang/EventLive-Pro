import { useEffect, useRef, useState } from 'react';
import { LIVE_BACKGROUND_MUSIC_EVENT } from '../../utils/backgroundMusic.js';
import { resolveMediaUrl } from '../../utils/format.js';

/** Optional ambient background music with user toggle (muted by default). */
export default function ThemeMusicToggle({ musicUrl }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const src = musicUrl ? resolveMediaUrl(musicUrl) : '';

  useEffect(() => {
    const el = audioRef.current;
    const pauseForLiveBgm = (event) => {
      if (!event?.detail?.playing) return;
      if (el && !el.paused) {
        el.pause();
        setPlaying(false);
      }
    };
    window.addEventListener(LIVE_BACKGROUND_MUSIC_EVENT, pauseForLiveBgm);
    return () => {
      window.removeEventListener(LIVE_BACKGROUND_MUSIC_EVENT, pauseForLiveBgm);
      el?.pause();
    };
  }, []);

  if (!src) return null;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.volume = 0.35;
      el.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <>
      <audio ref={audioRef} src={src} loop preload="none" />
      <button
        type="button"
        onClick={toggle}
        className="theme-music-toggle"
        aria-label={playing ? 'Mute background music' : 'Play background music'}
        title={playing ? 'Mute music' : 'Play music'}
      >
        {playing ? '🔊' : '🔇'}
      </button>
    </>
  );
}
