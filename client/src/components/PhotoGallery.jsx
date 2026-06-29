import { useEffect, useState } from 'react';

/**
 * Responsive photo gallery with a simple lightbox.
 * @param {{ photos: Array<{id?:string,_id?:string,url:string,caption?:string}>, onDelete?: (photoId:string)=>void }} props
 */
export default function PhotoGallery({ photos = [], onDelete }) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => e.key === 'Escape' && setActive(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  if (photos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No photos yet.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {photos.map((photo) => {
          const photoId = photo.id || photo._id;
          return (
            <div
              key={photoId || photo.url}
              className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
            >
              <button
                type="button"
                onClick={() => setActive(photo)}
                className="block h-full w-full"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || 'Event photo'}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </button>
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
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
            onClick={() => setActive(null)}
          >
            ×
          </button>
          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={active.url}
              alt={active.caption || 'Event photo'}
              className="mx-auto max-h-[80vh] w-auto rounded-lg"
            />
            {active.caption && (
              <figcaption className="mt-3 text-center text-sm text-slate-200">
                {active.caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
