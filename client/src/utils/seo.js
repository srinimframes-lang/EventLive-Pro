import { districtByRegion } from './districts.js';
import { coupleSlug, watchPath } from './format.js';
import { API_ORIGIN } from '../config.js';

const DEFAULT_SITE = 'https://eventlivepro.com';
const DEFAULT_OG =
  'https://images.unsplash.com/photo-1519741497674-05eec4c9a3e0?auto=format&fit=crop&w=1200&q=80';

export function getSiteOrigin(settings) {
  const fromSettings = settings?.seo?.siteUrl?.trim();
  if (fromSettings) return fromSettings.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return DEFAULT_SITE;
}

export function coupleTitle(event) {
  if (!event) return '';
  if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
  return event.brideName || event.groomName || '';
}

export function eventDetailPath(event) {
  if (!event?.slug) return '';
  return `/events/${event.slug}`;
}

export function absoluteUrl(origin, path) {
  const base = (origin || DEFAULT_SITE).replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function truncate(text, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function resolveSeoImage(url) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  if (path.startsWith('/uploads')) return `${API_ORIGIN}${path}`;
  return absoluteUrl(getSiteOrigin(), path);
}

export function buildEventTitle(event, settings) {
  const site = settings?.companyName || 'EventLive Pro';
  const couple = coupleTitle(event);
  const label = couple || event?.title || 'Live Event';
  const status =
    event?.status === 'live' ? 'Live Now' : event?.status === 'ended' ? 'Replay' : 'Watch Live';
  return `${label} — ${status} | ${site}`;
}

export function buildEventDescription(event, settings) {
  const couple = coupleTitle(event);
  const venue = event?.venue || event?.location || 'Online';
  const date = event?.startTime
    ? new Date(event.startTime).toLocaleDateString('en-IN', { dateStyle: 'long' })
    : '';
  const region = event?.themeSnapshot?.region
    ? districtByRegion(event.themeSnapshot.region)?.name || event.themeSnapshot.region
    : '';
  const parts = [];
  if (couple) parts.push(`Join ${couple}'s celebration streamed live in HD.`);
  else parts.push(`Watch ${event?.title || 'this event'} live in HD.`);
  if (date) parts.push(`Event date: ${date}.`);
  if (venue && venue !== 'Online') parts.push(`Venue: ${venue}.`);
  if (region) parts.push(`${region} wedding live stream.`);
  parts.push(
    truncate(event?.description, 120) ||
      `${settings?.tagline || 'Premium wedding live streaming'} by ${settings?.companyName || 'EventLive Pro'}.`
  );
  return truncate(parts.join(' '), 300);
}

export function resolveEventOgImage(event, settings) {
  const candidates = [
    event?.coverImage,
    event?.themeSnapshot?.backgroundImage,
    event?.gallery?.[0]?.url,
    settings?.seo?.defaultOgImage,
    settings?.companyLogo,
    DEFAULT_OG,
  ];
  for (const url of candidates) {
    const resolved = resolveSeoImage(url);
    if (resolved) return resolved;
  }
  return DEFAULT_OG;
}

export function buildEventCanonical(event, settings) {
  const origin = getSiteOrigin(settings);
  if (event?.brandDomain) return absoluteUrl(`https://${event.brandDomain}`, watchPath(event));
  return absoluteUrl(origin, watchPath(event));
}

export function shouldNoIndexEvent(event) {
  return !event || !['published', 'live', 'ended'].includes(event.status);
}

export function buildOrganizationJsonLd(settings, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings?.companyName || 'EventLive Pro',
    url: siteUrl,
    logo: resolveSeoImage(settings?.companyLogo) || undefined,
    description: settings?.tagline || 'Premium wedding live streaming',
    email: settings?.contactEmail || undefined,
    telephone: settings?.contactPhone || settings?.whatsappNumber || undefined,
  };
}

export function buildWebsiteJsonLd(settings, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings?.companyName || 'EventLive Pro',
    url: siteUrl,
    description: settings?.tagline || 'Premium wedding live streaming',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/events?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildLocalBusinessJsonLd(settings, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: settings?.companyName || 'EventLive Pro',
    url: siteUrl,
    description: settings?.tagline || 'Premium wedding and event live streaming services',
    telephone: settings?.contactPhone || settings?.whatsappNumber || undefined,
    email: settings?.contactEmail || undefined,
    address: settings?.address
      ? { '@type': 'PostalAddress', streetAddress: settings.address }
      : undefined,
    image: resolveSeoImage(settings?.companyLogo) || undefined,
    priceRange: '₹₹',
  };
}

export function buildBreadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildEventJsonLd(event, settings, canonicalUrl) {
  const couple = coupleTitle(event);
  const location = event?.venue || event?.location || 'Online';
  const isOnline = event?.isOnline !== false;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: couple || event?.title,
    description: truncate(event?.description, 500),
    startDate: event?.startTime,
    endDate: event?.endTime,
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/MixedEventAttendanceMode',
    image: resolveEventOgImage(event, settings),
    url: canonicalUrl,
    organizer: {
      '@type': 'Organization',
      name: event?.organizer?.name || settings?.companyName || 'EventLive Pro',
    },
  };
  if (!isOnline || location !== 'Online') {
    schema.location = { '@type': 'Place', name: location, address: location };
  } else {
    schema.location = { '@type': 'VirtualLocation', url: canonicalUrl };
  }
  return schema;
}

export function buildDistrictTitle(district, settings) {
  return `${district.headline} | ${settings?.companyName || 'EventLive Pro'}`;
}

export function buildDistrictDescription(district) {
  return truncate(district.description, 300);
}

export function galleryPhotoAlt(photo, event, index = 0) {
  const couple = coupleTitle(event);
  const base = couple ? `${couple} wedding photo` : `${event?.title || 'Event'} photo`;
  if (photo?.caption) return photo.caption;
  return `${base} ${index + 1}`;
}

export function coverImageAlt(event) {
  const couple = coupleTitle(event);
  if (couple) return `${couple} — wedding cover photo`;
  return `${event?.title || 'Event'} cover photo`;
}

export { coupleSlug, watchPath, DEFAULT_OG };
