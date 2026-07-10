import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '../utils/format.js';
import { isBannerVideo } from '../utils/bannerMedia.js';

/**
 * Load natural pixel dimensions for a banner image or video URL.
 */
export function useBannerNaturalSize(url, mediaType) {
  const [size, setSize] = useState(null);

  useEffect(() => {
    if (!url) {
      setSize(null);
      return undefined;
    }

    const src = url.startsWith('blob:') ? url : resolveMediaUrl(url);
    let cancelled = false;

    if (mediaType === 'video' || isBannerVideo({ imageUrl: url, mediaType })) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const onMeta = () => {
        if (cancelled) return;
        if (video.videoWidth && video.videoHeight) {
          setSize({ width: video.videoWidth, height: video.videoHeight });
        }
      };
      video.addEventListener('loadedmetadata', onMeta);
      video.src = src;
      return () => {
        cancelled = true;
        video.removeEventListener('loadedmetadata', onMeta);
        video.src = '';
      };
    }

    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.onerror = () => {
      if (!cancelled) setSize(null);
    };
    img.src = src;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url, mediaType]);

  return size;
}
