import { useMemo } from 'react';
import PageSeo from './PageSeo.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildEventCanonical,
  buildEventDescription,
  buildEventJsonLd,
  buildEventTitle,
  buildLocalBusinessJsonLd,
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
  getSiteOrigin,
  resolveEventOgImage,
  shouldNoIndexEvent,
} from '../../utils/seo.js';

/**
 * SEO wrapper for public event pages (watch + detail).
 */
export default function EventSeo({ event, pageType = 'watch' }) {
  const { settings } = useSettings();

  const seo = useMemo(() => {
    if (!event) return null;
    const siteUrl = getSiteOrigin(settings);
    const title = buildEventTitle(event, settings);
    const description = buildEventDescription(event, settings);
    const canonical = buildEventCanonical(event, settings);
    const image = resolveEventOgImage(event, settings);
    const couple =
      event.brideName && event.groomName
        ? `${event.groomName} & ${event.brideName}`
        : event.brideName || event.groomName || event.title;

    return {
      title,
      description,
      canonical,
      image,
      noindex: shouldNoIndexEvent(event),
      jsonLd: [
        buildOrganizationJsonLd(settings, siteUrl),
        buildWebsiteJsonLd(settings, siteUrl),
        buildLocalBusinessJsonLd(settings, siteUrl),
        buildEventJsonLd(event, settings, canonical),
        buildBreadcrumbJsonLd([
          { name: 'Home', url: siteUrl },
          { name: 'Events', url: absoluteUrl(siteUrl, '/events') },
          { name: couple, url: canonical },
        ]),
      ],
    };
  }, [event, settings, pageType]);

  if (!seo) return null;

  return (
    <PageSeo
      title={seo.title}
      description={seo.description}
      canonical={seo.canonical}
      image={seo.image}
      noindex={seo.noindex}
      type={pageType === 'watch' && event?.status === 'live' ? 'website' : 'article'}
      siteName={settings.companyName || 'EventLive Pro'}
      gscVerification={settings.googleSearchConsoleVerification}
      jsonLd={seo.jsonLd}
    />
  );
}
