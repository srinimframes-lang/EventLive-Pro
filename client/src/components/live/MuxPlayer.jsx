import { buildMuxPlayerIframeUrl } from '../../utils/muxPlayer.js';

/**
 * Official Mux Player iframe for live and recorded VOD.
 */
export default function MuxPlayer({
  mode = 'live',
  playbackId = '',
  iframeUrl = '',
  poster = '',
  title = 'Live stream',
}) {
  const src =
    String(iframeUrl || '').trim() ||
    buildMuxPlayerIframeUrl({ playbackId, mode, poster });

  if (!src) return null;

  return (
    <iframe
      className="absolute inset-0 h-full w-full bg-black"
      src={src}
      title={title}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}
