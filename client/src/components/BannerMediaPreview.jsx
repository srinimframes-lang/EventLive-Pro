import { resolveMediaUrl } from '../utils/format.js';
import { isBannerVideo } from '../utils/bannerMedia.js';
import { resolveBannerFitMode } from '../utils/bannerSizes.js';
import BannerMedia from './BannerMedia.jsx';

/**
 * Compact admin table thumbnail.
 */
export default function BannerMediaPreview({ banner, src, mediaType }) {
  const previewBanner = {
    ...banner,
    imageUrl: src || banner?.imageUrl,
    mediaType: mediaType || banner?.mediaType,
  };

  if (!previewBanner.imageUrl) {
    return (
      <div className="grid h-10 w-24 place-items-center text-[10px] text-slate-400">No media</div>
    );
  }

  const isVideo = isBannerVideo(previewBanner);
  const fit = resolveBannerFitMode(previewBanner);

  return (
    <div className="relative h-10 w-24 overflow-hidden rounded border border-slate-200 bg-slate-50">
      <BannerMedia
        banner={previewBanner}
        className="h-full w-full"
        objectFit={fit}
        autoPlay={isVideo}
        loop={isVideo}
        muted
        playsInline
        alt=""
      />
      {isVideo && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-0.5 text-[8px] text-white">
          ▶
        </span>
      )}
    </div>
  );
}
