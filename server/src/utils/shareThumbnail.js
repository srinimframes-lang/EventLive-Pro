import { watchPath } from './seo.js';

export const SHARE_THUMB_WIDTH = 1280;
export const SHARE_THUMB_HEIGHT = 720;
export const SHARE_THUMB_SUBTITLE = 'Wedding Live Streaming';
export const SHARE_THUMB_BRAND = 'eventlivepro.com';

function trimField(value) {
  return String(value || '').trim();
}

/**
 * Large couple headline painted on the YouTube-style thumbnail.
 * "Devi Weds Ramu" when both names exist; otherwise the event title.
 */
export function thumbnailHeadline(event) {
  const bride = trimField(event?.brideName);
  const groom = trimField(event?.groomName);
  const title = trimField(event?.title);
  if (bride && groom) return `${bride} Weds ${groom}`;
  if (bride || groom) return bride || groom;
  return title;
}

/**
 * Branding line — always EventLivePro unless a white-label host is set.
 */
export function thumbnailBrandHost(settings, event) {
  const branded = trimField(event?.brandDomain).replace(/^www\./i, '').toLowerCase();
  if (branded) return branded;
  const site = trimField(settings?.seo?.siteUrl);
  if (site) {
    try {
      const host = new URL(site.includes('://') ? site : `https://${site}`).hostname
        .replace(/^www\./i, '')
        .toLowerCase();
      if (host) return host;
    } catch {
      /* fall through */
    }
  }
  return SHARE_THUMB_BRAND;
}

/**
 * Public watch URL shown on the thumbnail (host + path). Empty if no path yet.
 */
export function thumbnailShareUrl(event, settings) {
  const path = watchPath(event);
  if (!path) return '';
  const host = thumbnailBrandHost(settings, event);
  return `${host}${path}`;
}

export function thumbnailOverlayCopy(event, settings) {
  return {
    headline: thumbnailHeadline(event),
    subtitle: SHARE_THUMB_SUBTITLE,
    brand: thumbnailBrandHost(settings, event),
    url: thumbnailShareUrl(event, settings),
    width: SHARE_THUMB_WIDTH,
    height: SHARE_THUMB_HEIGHT,
  };
}
