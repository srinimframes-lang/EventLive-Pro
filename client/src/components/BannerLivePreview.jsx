import BannerFrame from './BannerFrame.jsx';

/** Admin live preview — same layout engine as the public banner slot. */
export default function BannerLivePreview({ banner, src, mediaType, naturalSize }) {
  const previewBanner = {
    ...banner,
    imageUrl: src || banner?.imageUrl,
    mediaType: mediaType || banner?.mediaType,
    sizePreset: banner?.sizePreset,
    fitMode: banner?.fitMode,
    mobileSize: banner?.mobileSize,
  };

  if (!previewBanner.imageUrl) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Upload media to see live size preview
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Live preview (actual rendered size)
      </p>
      <div className="mx-auto w-full max-w-[970px]">
        <BannerFrame
          banner={previewBanner}
          naturalSize={naturalSize}
          autoPlay
          showRenderedSize
          ariaLabel="Banner live preview"
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Resize your browser to see mobile vs desktop behaviour. Banners use full available width up
        to the selected standard size.
      </p>
    </div>
  );
}
