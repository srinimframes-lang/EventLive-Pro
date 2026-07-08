import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { Settings } from '../models/Settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { districtBySlug, regionFromDistrictSlug } from '../constants/districts.js';
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildDistrictDescription,
  buildDistrictJsonLd,
  buildDistrictTitle,
  buildEventDescription,
  buildEventJsonLd,
  buildEventTitle,
  buildLocalBusinessJsonLd,
  buildOgHtml,
  buildOrganizationJsonLd,
  buildSitemapXml,
  buildWebsiteJsonLd,
  eventDetailPath,
  getSiteUrl,
  isPublicEvent,
  PUBLIC_STATUSES,
  resolveOgImage,
  shouldNoIndexEvent,
  staticSitemapPaths,
  watchPath,
} from '../utils/seo.js';

const API_ORIGIN = 'https://eventlive-pro.onrender.com';

async function loadSettings() {
  return Settings.getSingleton();
}

async function findEventByPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [section, idOrSlug] = parts;
  if (!['live', 'events', 'watch'].includes(section)) return null;

  const raw = String(idOrSlug || '');
  const query = mongoose.isValidObjectId(raw)
    ? { _id: raw }
    : { $or: [{ shortCode: raw.toUpperCase() }, { slug: raw.toLowerCase() }, { slug: raw }] };

  return Event.findOne(query).populate('organizer', 'name email').lean();
}

/**
 * @route GET /sitemap.xml
 */
export const getSitemap = asyncHandler(async (_req, res) => {
  const settings = await loadSettings();
  const siteUrl = getSiteUrl(settings);
  const events = await Event.find({ status: { $in: PUBLIC_STATUSES } })
    .select('slug shortCode brideName groomName updatedAt status')
    .lean();

  const urls = staticSitemapPaths(siteUrl);
  for (const ev of events) {
    const lastmod = ev.updatedAt ? new Date(ev.updatedAt).toISOString().slice(0, 10) : undefined;
    if (ev.slug) {
      urls.push({
        loc: absoluteUrl(siteUrl, eventDetailPath(ev)),
        lastmod,
        changefreq: ev.status === 'live' ? 'hourly' : 'weekly',
        priority: '0.8',
      });
    }
    urls.push({
      loc: absoluteUrl(siteUrl, watchPath(ev)),
      lastmod,
      changefreq: ev.status === 'live' ? 'hourly' : 'weekly',
      priority: '0.9',
    });
  }

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.status(200).send(buildSitemapXml(urls));
});

/**
 * @route GET /robots.txt
 */
export const getRobots = asyncHandler(async (_req, res) => {
  const settings = await loadSettings();
  const siteUrl = getSiteUrl(settings);
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /reseller
Disallow: /login
Disallow: /register
Disallow: /admin/login
Disallow: /book/new
Disallow: /events/new
Disallow: /events/*/edit
Disallow: /events/*/studio

Sitemap: ${siteUrl}/sitemap.xml
`;
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.status(200).send(body);
});

/**
 * @route GET /api/seo/preview?path=/live/...
 * Returns minimal HTML with OG tags for social crawlers.
 */
export const getSeoPreview = asyncHandler(async (req, res) => {
  const pathname = String(req.query.path || '/').split('?')[0];
  const settings = await loadSettings();
  const siteUrl = getSiteUrl(settings);
  const siteName = settings.companyName || 'EventLive Pro';
  const gsc = settings.googleSearchConsoleVerification || '';

  if (pathname.startsWith('/districts/')) {
    const slug = pathname.split('/')[2];
    const district = districtBySlug(slug);
    if (!district) {
      res.status(404);
      throw new Error('District not found');
    }
    const url = absoluteUrl(siteUrl, `/districts/${district.slug}`);
    const title = buildDistrictTitle(district, settings);
    const description = buildDistrictDescription(district);
    const jsonLd = [
      buildOrganizationJsonLd(settings, siteUrl),
      buildWebsiteJsonLd(settings),
      buildLocalBusinessJsonLd(settings),
      buildDistrictJsonLd(district, settings, url),
      buildBreadcrumbJsonLd([
        { name: 'Home', url: siteUrl },
        { name: 'Districts', url: absoluteUrl(siteUrl, '/districts') },
        { name: district.name, url },
      ]),
    ];
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(
      buildOgHtml({
        title,
        description,
        url,
        image: resolveOgImage(null, settings, API_ORIGIN),
        siteName,
        jsonLd,
        gscVerification: gsc,
      })
    );
  }

  const event = await findEventByPath(pathname);
  if (!event) {
    res.status(404);
    throw new Error('Page not found');
  }

  const canonicalPath = watchPath(event);
  const url = absoluteUrl(siteUrl, canonicalPath);
  const title = buildEventTitle(event, settings);
  const description = buildEventDescription(event, settings);
  const image = resolveOgImage(event, settings, API_ORIGIN);
  const robots = shouldNoIndexEvent(event) ? 'noindex,nofollow' : 'index,follow';
  const jsonLd = [
    buildOrganizationJsonLd(settings, siteUrl),
    buildWebsiteJsonLd(settings),
    buildLocalBusinessJsonLd(settings),
    buildEventJsonLd(event, settings, url),
    buildBreadcrumbJsonLd([
      { name: 'Home', url: siteUrl },
      { name: 'Events', url: absoluteUrl(siteUrl, '/events') },
      { name: coupleLabel(event), url },
    ]),
  ];

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(
    buildOgHtml({
      title,
      description,
      url,
      image,
      siteName,
      type: 'website',
      robots,
      jsonLd,
      gscVerification: gsc,
    })
  );
});

/**
 * @route GET /api/seo/districts
 */
export const listDistrictSeo = asyncHandler(async (_req, res) => {
  const settings = await loadSettings();
  const siteUrl = getSiteUrl(settings);
  const counts = await Event.aggregate([
    { $match: { status: { $in: PUBLIC_STATUSES }, 'themeSnapshot.region': { $ne: '' } } },
    { $group: { _id: '$themeSnapshot.region', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  const { DISTRICTS } = await import('../constants/districts.js');
  const data = DISTRICTS.map((d) => ({
    ...d,
    eventCount: countMap[d.region] || 0,
    url: absoluteUrl(siteUrl, `/districts/${d.slug}`),
  }));

  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/seo/districts/:slug
 */
export const getDistrictSeo = asyncHandler(async (req, res) => {
  const district = districtBySlug(req.params.slug);
  if (!district) {
    res.status(404);
    throw new Error('District not found');
  }
  const settings = await loadSettings();
  const siteUrl = getSiteUrl(settings);
  const region = regionFromDistrictSlug(district.slug);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const skip = (page - 1) * limit;

  const filter = { status: { $in: PUBLIC_STATUSES }, 'themeSnapshot.region': region };
  const [events, total] = await Promise.all([
    Event.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit).populate('organizer', 'name').lean(),
    Event.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      district: {
        ...district,
        title: buildDistrictTitle(district, settings),
        description: buildDistrictDescription(district),
        url: absoluteUrl(siteUrl, `/districts/${district.slug}`),
      },
      events,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

function coupleLabel(event) {
  if (event.brideName && event.groomName) return `${event.groomName} & ${event.brideName}`;
  return event.brideName || event.groomName || event.title;
}

/**
 * @route GET /api/seo/event/:idOrSlug
 * Lightweight meta payload for client-side SEO.
 */
export const getEventSeoMeta = asyncHandler(async (req, res) => {
  const event = await findEventByPath(`/events/${req.params.idOrSlug}`);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }
  const settings = await loadSettings();
  const siteUrl = getSiteUrl(settings);
  const canonicalPath = watchPath(event);
  const url = absoluteUrl(siteUrl, canonicalPath);

  res.status(200).json({
    success: true,
    data: {
      title: buildEventTitle(event, settings),
      description: buildEventDescription(event, settings),
      canonical: url,
      image: resolveOgImage(event, settings, API_ORIGIN),
      noindex: shouldNoIndexEvent(event),
      jsonLd: {
        event: buildEventJsonLd(event, settings, url),
        breadcrumb: buildBreadcrumbJsonLd([
          { name: 'Home', url: siteUrl },
          { name: 'Events', url: absoluteUrl(siteUrl, '/events') },
          { name: coupleLabel(event), url },
        ]),
      },
    },
  });
});

export { isPublicEvent };
