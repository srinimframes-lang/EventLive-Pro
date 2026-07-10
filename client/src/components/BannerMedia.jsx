import { useEffect, useRef } from 'react';
import { resolveMediaUrl } from '../utils/format.js';
import { isBannerVideo } from '../utils/bannerMedia.js';

/**
 * Renders a banner image or auto-playing muted video.
 */
export default function BannerMedia({
  banner,
  className = '',
  objectFit = 'contain',
  autoPlay = false,
  muted = true,
  loop = false,
  playsInline = true,
  controls = false,
  alt = 'Advertisement',
}) {
  const videoRef = useRef(null);
  const src = resolveMediaUrl(banner?.imageUrl);
  const isVideo = isBannerVideo(banner);

  useEffect(() => {
    if (!isVideo || !autoPlay) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;
    el.muted = true;
    const playPromise = el.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
    return () => {
      el.pause();
    };
  }, [isVideo, autoPlay, src]);

  if (!src) return null;

  const fitStyle = { objectFit };

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={src}
        className={className}
        style={fitStyle}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline={playsInline}
        controls={controls}
        preload="metadata"
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={fitStyle}
      loading="lazy"
      decoding="async"
    />
  );
}
