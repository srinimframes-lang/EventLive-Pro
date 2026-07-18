import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveMediaUrl } from '../utils/format.js';
import { galleryPhotoAlt } from '../utils/seo.js';

/**
 * Responsive photo gallery with fullscreen lightbox (next/prev + swipe).
 * Images lazy-load so they do not contend with live HLS playback.
 */
export default function PhotoGallery({ photos = [], event, onDelete, initialCount = 12 }) {
  const ordered = useMemo(() => {
    return [...photos].sort((a, b) => {
      if (a.isCover && !b.isCover) return -1;
      if (!a.isCover && b.isCover) return 1;
      return (Number(a.order) || 0) - (Number(b.order) || 0);
    });
  }, [photos]);

  const [visibleCount, setVisibleCount] = useState(initialCount);
  const [activeIndex, setActiveIndex] = useState(-1);
  const touchStartX = useRef(null);

  const visible = ordered.slice(0, visibleCount);
  const hasMore = visibleCount < ordered.length;
  const active = activeIndex >= 0 ? ordered[activeIndex] : null;

  const close = useCallback(() => setActiveIndex(-1), []);
  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i <= 0 ? ordered.length - 1 : i - 1));
  }, [ordered.length]);
  const goNext = useCallback(() => {
    setActiveIndex((i) => (i < 0 ? 0 : (i + 1) % ordered.length));
  }, [ordered.length]);

  useEffect(() => {
    if (activeIndex < 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, close, goPrev, goNext]);

  if (ordered.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No photos yet.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {visible.map((photo, index) => {
          const photoId = photo.id || photo._id;
          const alt = galleryPhotoAlt(photo, event, index);
          return (
            <div
              key={photoId || photo.url || index}
              className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
            >
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className="block h-full w-full"
              >
                <img
                  src={resolveMediaUrl(photo.url)}
                  alt={alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </button>
              {photo.isCover && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Cover
                </span>
              )}
              {photo.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-xs text-white">
                  {photo.caption}
                </span>
              )}
              {onDelete && photoId && (
                <button
                  type="button"
                  onClick={() => onDelete(photoId)}
                  aria-label="Delete photo"
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            className="btn-outline"
            onClick={() => setVisibleCount((n) => Math.min(n + 12, ordered.length))}
          >
            Load more photos ({ordered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          onTouchStart={(e) => {
            touchStartX.current = e.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            const end = e.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (start == null || end == null) return;
            const dx = end - start;
            if (Math.abs(dx) < 50) return;
            if (dx > 0) goPrev();
            else goNext();
          }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
            onClick={close}
          >
            ×
          </button>
          {ordered.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 sm:left-6"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 sm:right-6"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
              >
                ›
              </button>
            </>
          )}
          <figure
            className="relative max-h-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={resolveMediaUrl(active.url)}
              alt={active.caption || 'Event photo'}
              className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
            <figcaption className="mt-3 text-center text-sm text-slate-200">
              {active.caption || `${activeIndex + 1} / ${ordered.length}`}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
