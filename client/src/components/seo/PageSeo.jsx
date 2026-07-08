import { Helmet } from 'react-helmet-async';

/**
 * Central SEO component — titles, meta, OG, Twitter, canonical, JSON-LD.
 */
export default function PageSeo({
  title,
  description,
  canonical,
  image,
  type = 'website',
  noindex = false,
  jsonLd = [],
  siteName = 'EventLive Pro',
  gscVerification = '',
}) {
  const robots = noindex ? 'noindex,nofollow' : 'index,follow';
  const scripts = jsonLd.filter(Boolean);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      {canonical && <link rel="canonical" href={canonical} />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {canonical && <meta property="og:url" content={canonical} />}
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}

      {gscVerification && (
        <meta name="google-site-verification" content={gscVerification} />
      )}

      {scripts.map((ld, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}
    </Helmet>
  );
}
