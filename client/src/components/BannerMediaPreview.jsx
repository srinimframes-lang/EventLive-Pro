import { isBannerVideo } from '../utils/bannerMedia.js';
import BannerMedia from './BannerMedia.jsx';

/**
 * Admin / inline preview for banner image or video.
 */
export default function BannerMediaPreview({
  banner,
  src,
  mediaType,
  className,
  compact = false,
}) {
  const resolvedSrc = src || banner?.imageUrl;
  const previewBanner = {
    imageUrl: resolvedSrc,
    mediaType: mediaType || banner?.mediaType,
  };

  const mediaClass =
    className ||
    (compact ? 'h-10 w-24 object-contain' : 'h-[90px] w-[320px] max-w-full object-contain sm:w-[728px]');

  if (!previewBanner.imageUrl) {
    return (
      <div
        className={`grid place-items-center text-xs text-slate-400 ${
          compact ? 'h-10 w-24' : 'h-[90px] w-[320px]'
        }`}
      >
        No media
      </div>
    );
  }

  const isVideo = isBannerVideo(previewBanner);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${
        compact ? 'inline-block' : ''
      }`}
    >
      <BannerMedia
        banner={previewBanner}
        className={mediaClass}
        autoPlay={isVideo}
        loop={isVideo}
        muted
        playsInline
        alt="Banner preview"
      />
      {isVideo && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
          Video
        </span>
      )}
    </div>
  );
}
