/** Standard IAB banner sizes and display helpers (shared client logic). */

export const BANNER_SIZE_PRESETS = {
  '320x50': { width: 320, height: 50, label: 'Mobile Leaderboard (320×50)' },
  '320x100': { width: 320, height: 100, label: 'Large Mobile Banner (320×100)' },
  '468x60': { width: 468, height: 60, label: 'Full Banner (468×60)' },
  '728x90': { width: 728, height: 90, label: 'Leaderboard (728×90)' },
  '970x90': { width: 970, height: 90, label: 'Large Leaderboard (970×90)' },
  '970x250': { width: 970, height: 250, label: 'Billboard (970×250)' },
  auto: { width: null, height: null, label: 'Auto (use uploaded dimensions)' },
};

export const BANNER_SIZE_KEYS = Object.keys(BANNER_SIZE_PRESETS);

const LEGACY_MOBILE_MAP = {
  '50': '320x50',
  '100': '320x100',
};

/** Resolve preset from banner document (supports legacy mobileSize). */
export function resolveBannerSizePreset(banner) {
  if (banner?.sizePreset && BANNER_SIZE_PRESETS[banner.sizePreset]) {
    return banner.sizePreset;
  }
  if (banner?.mobileSize && LEGACY_MOBILE_MAP[banner.mobileSize]) {
    return LEGACY_MOBILE_MAP[banner.mobileSize];
  }
  return '728x90';
}

export function resolveBannerFitMode(banner) {
  return banner?.fitMode === 'cover' ? 'cover' : 'contain';
}

/**
 * Layout dimensions for a banner slot.
 * @param {object} banner
 * @param {{ width: number, height: number } | null} naturalSize
 */
export function getBannerLayout(banner, naturalSize = null) {
  const preset = resolveBannerSizePreset(banner);
  const fitMode = resolveBannerFitMode(banner);

  if (preset === 'auto' && naturalSize?.width && naturalSize?.height) {
    const { width, height } = naturalSize;
    return {
      preset,
      fitMode,
      aspectRatio: width / height,
      maxWidth: Math.min(width, 970),
      nativeWidth: width,
      nativeHeight: height,
      label: `${width}×${height} (auto)`,
    };
  }

  const spec = BANNER_SIZE_PRESETS[preset] || BANNER_SIZE_PRESETS['728x90'];
  return {
    preset,
    fitMode,
    aspectRatio: spec.width / spec.height,
    maxWidth: spec.width,
    nativeWidth: spec.width,
    nativeHeight: spec.height,
    label: `${spec.width}×${spec.height}`,
  };
}

/** Pick the closest standard preset for uploaded pixel dimensions. */
export function detectClosestSizePreset(width, height) {
  if (!width || !height) return '728x90';
  const ratio = width / height;
  let best = '728x90';
  let bestDiff = Infinity;

  for (const key of BANNER_SIZE_KEYS) {
    if (key === 'auto') continue;
    const spec = BANNER_SIZE_PRESETS[key];
    const diff = Math.abs(spec.width / spec.height - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = key;
    }
  }
  return best;
}

export function formatRenderedSize(widthPx, heightPx) {
  if (!widthPx || !heightPx) return '—';
  return `${Math.round(widthPx)}×${Math.round(heightPx)} px`;
}
