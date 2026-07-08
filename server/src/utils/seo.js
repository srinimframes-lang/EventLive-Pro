import { DISTRICTS, districtByRegion } from '../constants/districts.js';

const PUBLIC_STATUSES = ['published', 'live', 'ended'];
const DEFAULT_SITE = 'https://eventlivepro.com';
const DEFAULT_OG = 'https://images.unsplash.com/photo-1519741497674-05eec4c9a3e0?auto=format&fit=crop&w=1200&q=80';

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getSiteUrl(settings) {
  const fromSettings = settings?.seo?.siteUrl?.trim();
  return (fromSettings || DEFAULT_SITE).replace(/\/+$/, '');
}

export function coupleTitle(event) {
  if (!event) return '';
  if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
  return event.brideName || event.groomName || '';
}

export function coupleSlug(event) {
  if (!event) return '';
  const groom = slugify(event.groomName);
  const bride = slugify(event.brideName);
  if (groom && bride) return `${groom}-weds-${bride}`;
  return groom || bride || '';
}

export function watchPath(event) {
  if (!event) return '';
  const code = event.shortCode || event.slug || event.id || event._id;
  const couple = coupleSlug(event);
  return couple ? `/live/${code}/${couple}` : `/live/${code}`;
}

export function eventDetailPath(event) {
  if (!event?.slug) return '';
  return `/events/${event.slug}`;
}

export function absoluteUrl(siteUrl, path) {
  const base = (siteUrl || DEFAULT_SITE).replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function resolveMediaUrl(url, apiOrigin) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  if (path.startsWith('/uploads') && apiOrigin) return `${apiOrigin.replace(/\/+$/, '')}${path}`;
  return absoluteUrl(DEFAULT_SITE, path);
}

export function truncate(text, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function buildEventTitle(event, settings) {
  const site = settings?.companyName || 'EventLive Pro';
  const couple = coupleTitle(event);
  const label = couple || event.title;
  const status = event.status === 'live' ? 'Live Now' : event.status === 'ended' ? 'Replay' : 'Watch Live';
  return `${label} — ${status} | ${site}`;
}

export function buildEventDescription(event, settings) {
  const couple = coupleTitle(event);
  const venue = event.venue || event.location || 'Online';
  const date = event.startTime
    ? new Date(event.startTime).toLocaleDateString('en-IN', { dateStyle: 'long' })
    : '';
  const region = event.themeSnapshot?.region
    ? districtByRegion(event.themeSnapshot.region)?.name || event.themeSnapshot.region
    : '';
  const parts = [];
  if (couple) {
    parts.push(`Join ${couple}'s celebration streamed live in HD.`);
  } else {
    parts.push(`Watch ${event.title} live in HD.`);
  }
  if (date) parts.push(`Event date: ${date}.`);
  if (venue && venue !== 'Online') parts.push(`Venue: ${venue}.`);
  if (region) parts.push(`${region} wedding live stream.`);
  parts.push(
    truncate(event.description, 120) ||
      `${settings?.tagline || 'Premium wedding live streaming'} by ${settings?.companyName || 'EventLive Pro'}.`
  );
  return truncate(parts.join(' '), 300);
}

export function buildDistrictTitle(district, settings) {
  const site = settings?.companyName || 'EventLive Pro';
  return `${district.headline} | ${site}`;
}

export function buildDistrictDescription(district) {
  return truncate(district.description, 300);
}

export function resolveOgImage(event, settings, apiOrigin) {
  const candidates = [
    event?.coverImage,
    event?.themeSnapshot?.backgroundImage,
    event?.gallery?.[0]?.url,
    settings?.seo?.defaultOgImage,
    settings?.companyLogo,
    DEFAULT_OG,
  ];
  for (const url of candidates) {
    const resolved = resolveMediaUrl(url, apiOrigin);
    if (resolved) return resolved;
  }
  return DEFAULT_OG;
}

export function isPublicEvent(event) {
  return event && PUBLIC_STATUSES.includes(event.status);
}

export function shouldNoIndexEvent(event) {
  return !isPublicEvent(event);
}

export function buildOrganizationJsonLd(settings, siteUrl) {
  const url = getSiteUrl(settings);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings?.companyName || 'EventLive Pro',
    url,
    logo: resolveMediaUrl(settings?.companyLogo, ''),
    description: settings?.tagline || 'Premium wedding live streaming',
    email: settings?.contactEmail || undefined,
    telephone: settings?.contactPhone || settings?.whatsappNumber || undefined,
    sameAs: siteUrl ? [url] : undefined,
  };
}

export function buildWebsiteJsonLd(settings) {
  const url = getSiteUrl(settings);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings?.companyName || 'EventLive Pro',
    url,
    description: settings?.tagline || 'Premium wedding live streaming',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${url}/events?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildLocalBusinessJsonLd(settings) {
  const url = getSiteUrl(settings);
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: settings?.companyName || 'EventLive Pro',
    url,
    description: settings?.tagline || 'Premium wedding and event live streaming services',
    telephone: settings?.contactPhone || settings?.whatsappNumber || undefined,
    email: settings?.contactEmail || undefined,
    address: settings?.address
      ? { '@type': 'PostalAddress', streetAddress: settings.address }
      : undefined,
    image: resolveMediaUrl(settings?.companyLogo, '') || undefined,
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
  const location = event.venue || event.location || 'Online';
  const isOnline = event.isOnline !== false;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: couple || event.title,
    description: truncate(event.description, 500),
    startDate: event.startTime,
    endDate: event.endTime,
    eventStatus:
      event.status === 'live'
        ? 'https://schema.org/EventScheduled'
        : event.status === 'ended'
          ? 'https://schema.org/EventPostponed'
          : 'https://schema.org/EventScheduled',
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/MixedEventAttendanceMode',
    image: resolveOgImage(event, settings, ''),
    url: canonicalUrl,
    organizer: {
      '@type': 'Organization',
      name: event.organizer?.name || settings?.companyName || 'EventLive Pro',
    },
  };
  if (!isOnline || location !== 'Online') {
    schema.location = {
      '@type': 'Place',
      name: location,
      address: location,
    };
  } else {
    schema.location = {
      '@type': 'VirtualLocation',
      url: canonicalUrl,
    };
  }
  return schema;
}

export function buildDistrictJsonLd(district, settings, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: district.headline,
    description: district.description,
    url: canonicalUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: settings?.companyName || 'EventLive Pro',
      url: getSiteUrl(settings),
    },
  };
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildOgHtml({
  title,
  description,
  url,
  image,
  siteName,
  type = 'website',
  robots = 'index,follow',
  jsonLd = [],
  gscVerification = '',
}) {
  const scripts = jsonLd
    .filter(Boolean)
    .map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
    .join('\n    ');
  const gscMeta = gscVerification
    ? `<meta name="google-site-verification" content="${escapeHtml(gscVerification)}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:type" content="${escapeHtml(type)}" />
    <meta property="og:site_name" content="${escapeHtml(siteName)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    ${gscMeta}
    ${scripts}
    <meta http-equiv="refresh" content="0;url=${escapeHtml(url)}" />
  </head>
  <body>
    <p><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></p>
  </body>
</html>`;
}

export function buildSitemapXml(urls) {
  const entries = urls
    .map(
      (u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}${u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ''}${u.priority ? `\n    <priority>${u.priority}</priority>` : ''}
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

export function staticSitemapPaths(siteUrl) {
  const base = siteUrl.replace(/\/+$/, '');
  const now = new Date().toISOString().slice(0, 10);
  const staticPages = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${base}/events`, priority: '0.9', changefreq: 'daily' },
    { loc: `${base}/book`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${base}/districts`, priority: '0.8', changefreq: 'weekly' },
  ];
  const districtPages = DISTRICTS.map((d) => ({
    loc: `${base}/districts/${d.slug}`,
    priority: '0.7',
    changefreq: 'weekly',
  }));
  return [...staticPages, ...districtPages].map((p) => ({ ...p, lastmod: now }));
}

export { PUBLIC_STATUSES, DISTRICTS, DEFAULT_SITE, DEFAULT_OG };
