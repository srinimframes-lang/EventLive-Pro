import { watchPath } from './format.js';

export const SHARE_THUMB_WIDTH = 1280;
export const SHARE_THUMB_HEIGHT = 720;
export const SHARE_THUMB_SUBTITLE = 'Wedding Live Streaming';
export const SHARE_THUMB_BRAND = 'eventlivepro.com';

function trimField(value) {
  return String(value || '').trim();
}

export function thumbnailHeadline(event) {
  const bride = trimField(event?.brideName);
  const groom = trimField(event?.groomName);
  const title = trimField(event?.title);
  if (bride && groom) return `${bride} Weds ${groom}`;
  if (bride || groom) return bride || groom;
  return title;
}

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
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.replace(/^www\./i, '').toLowerCase();
    if (host && host !== 'localhost') return host;
  }
  return SHARE_THUMB_BRAND;
}

export function thumbnailShareUrl(event, settings) {
  const path = watchPath(event);
  if (!path) return '';
  return `${thumbnailBrandHost(settings, event)}${path}`;
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
