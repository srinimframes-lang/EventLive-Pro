import { useEffect, useRef, useState } from 'react';
import BannerMedia from './BannerMedia.jsx';
import { useBannerNaturalSize } from '../hooks/useBannerNaturalSize.js';
import { formatRenderedSize, getBannerLayout } from '../utils/bannerSizes.js';

/**
 * Responsive banner frame — preserves aspect ratio, full width up to preset max.
 */
export default function BannerFrame({
  banner,
  naturalSize: naturalSizeProp,
  children,
  className = '',
  mediaClassName = '',
  onClick,
  autoPlay = false,
  showRenderedSize = false,
  ariaLabel = 'Advertisement',
}) {
  const frameRef = useRef(null);
  const [renderedSize, setRenderedSize] = useState(null);
  const detectedNatural = useBannerNaturalSize(
    naturalSizeProp ? null : banner?.imageUrl,
    banner?.mediaType
  );
  const naturalSize = naturalSizeProp || detectedNatural;
  const layout = getBannerLayout(banner, naturalSize);

  useEffect(() => {
    if (!showRenderedSize || !frameRef.current) return undefined;
    const node = frameRef.current;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setRenderedSize({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [showRenderedSize, layout.maxWidth, layout.aspectRatio]);

  const fitClass = layout.fitMode === 'cover' ? 'object-cover' : 'object-contain';

  const content = children || (
    <BannerMedia
      banner={banner}
      className={`banner-frame__media block h-full w-full ${fitClass} ${mediaClassName}`.trim()}
      objectFit={layout.fitMode}
      autoPlay={autoPlay}
      muted
      loop={autoPlay}
      playsInline
      alt={banner?.companyName || ariaLabel}
    />
  );

  const inner = onClick ? (
    <button
      type="button"
        onClick={onClick}
        className="group block h-full w-full cursor-pointer"
        aria-label={ariaLabel}
      >
      {content}
    </button>
  ) : (
    content
  );

  return (
    <div className={`banner-frame w-full ${className}`.trim()}>
      <div
        ref={frameRef}
        className="banner-frame__box relative w-full overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm"
        style={{
          maxWidth: layout.maxWidth,
          aspectRatio: layout.aspectRatio,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
        data-banner-preset={layout.preset}
        data-banner-fit={layout.fitMode}
      >
        {inner}
      </div>
      {showRenderedSize && (
        <p className="mt-1 text-center text-[11px] text-slate-500">
          Rendered: {formatRenderedSize(renderedSize?.width, renderedSize?.height)}
          {' · '}
          Target ratio: {layout.label}
          {' · '}
          Fit: {layout.fitMode}
        </p>
      )}
    </div>
  );
}
