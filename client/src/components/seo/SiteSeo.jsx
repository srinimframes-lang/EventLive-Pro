import { useMemo } from 'react';
import PageSeo from './PageSeo.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildLocalBusinessJsonLd,
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
  getSiteOrigin,
  resolveSeoImage,
  truncate,
} from '../../utils/seo.js';

/**
 * Default site-wide SEO for static marketing pages.
 */
export default function SiteSeo({ title, description, path = '/', image, noindex = false }) {
  const { settings } = useSettings();
  const siteUrl = getSiteOrigin(settings);
  const siteName = settings.companyName || 'EventLive Pro';

  const seo = useMemo(() => {
    const resolvedTitle =
      title ||
      settings.seo?.homepageTitle ||
      `${siteName} — ${settings.tagline || 'Premium Wedding Live Streaming'}`;
    const resolvedDescription =
      description ||
      settings.seo?.homepageDescription ||
      truncate(
        `${siteName} streams weddings and celebrations live in HD. Photo galleries, themed pages, and instant share links for guests worldwide.`,
        300
      );
    const canonical = absoluteUrl(siteUrl, path);
    const ogImage = resolveSeoImage(image || settings.seo?.defaultOgImage || settings.companyLogo);

    return {
      title: resolvedTitle,
      description: resolvedDescription,
      canonical,
      image: ogImage,
      jsonLd: [
        buildOrganizationJsonLd(settings, siteUrl),
        buildWebsiteJsonLd(settings, siteUrl),
        buildLocalBusinessJsonLd(settings, siteUrl),
        buildBreadcrumbJsonLd([
          { name: 'Home', url: siteUrl },
          ...(path !== '/'
            ? [{ name: resolvedTitle.split('|')[0].trim(), url: canonical }]
            : []),
        ]),
      ],
    };
  }, [title, description, path, image, settings, siteUrl, siteName]);

  return (
    <PageSeo
      title={seo.title}
      description={seo.description}
      canonical={seo.canonical}
      image={seo.image}
      noindex={noindex}
      siteName={siteName}
      gscVerification={settings.googleSearchConsoleVerification}
      jsonLd={seo.jsonLd}
    />
  );
}
