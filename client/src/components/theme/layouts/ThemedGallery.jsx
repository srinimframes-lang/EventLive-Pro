import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '../../../utils/format.js';

const VARIANTS = {
  'masonry-gold': 'gallery-masonry-gold',
  'horizontal-scroll': 'gallery-horizontal',
  polaroid: 'gallery-polaroid',
  'temple-tiles': 'gallery-temple-tiles',
  minimal: 'gallery-minimal',
  circles: 'gallery-circles',
  invitation: 'gallery-invitation',
  vintage: 'gallery-vintage',
  bento: 'gallery-bento',
  constellation: 'gallery-constellation',
  default: 'gallery-default',
};

export default function ThemedGallery({ photos = [], variant = 'default', onDelete }) {
  const [active, setActive] = useState(null);
  const rootClass = VARIANTS[variant] || VARIANTS.default;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => e.key === 'Escape' && setActive(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  if (photos.length === 0) {
    return (
      <p className="gallery-empty rounded-xl border border-dashed p-8 text-center text-sm opacity-70">
        No photos yet.
      </p>
    );
  }

  return (
    <>
      <div className={rootClass}>
        {photos.map((photo) => {
          const photoId = photo.id || photo._id;
          return (
            <div key={photoId || photo.url} className="gallery-item group relative overflow-hidden">
              <button type="button" onClick={() => setActive(photo)} className="block h-full w-full">
                <img
                  src={resolveMediaUrl(photo.url)}
                  alt={photo.caption || 'Event photo'}
                  loading="lazy"
                  className="gallery-img h-full w-full object-cover"
                />
              </button>
              {photo.caption && <span className="gallery-caption">{photo.caption}</span>}
              {onDelete && photoId && (
                <button
                  type="button"
                  onClick={() => onDelete(photoId)}
                  aria-label="Delete photo"
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl text-white"
            onClick={() => setActive(null)}
          >
            ×
          </button>
          <img
            src={resolveMediaUrl(active.url)}
            alt={active.caption || 'Photo'}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
