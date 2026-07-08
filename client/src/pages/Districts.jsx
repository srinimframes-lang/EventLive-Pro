import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageSeo from '../components/seo/PageSeo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildLocalBusinessJsonLd,
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
  getSiteOrigin,
  truncate,
} from '../utils/seo.js';
import { DISTRICTS } from '../utils/districts.js';
import api from '../services/api.js';

export default function Districts() {
  const { settings } = useSettings();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    api
      .get('/api/seo/districts')
      .then(({ data }) => {
        const map = {};
        (data.data || []).forEach((d) => {
          map[d.slug] = d.eventCount;
        });
        setCounts(map);
      })
      .catch(() => setCounts({}));
  }, []);

  const siteUrl = getSiteOrigin(settings);
  const title = `Wedding Live Streaming by District | ${settings.companyName || 'EventLive Pro'}`;
  const description = truncate(
    `Browse live wedding streams across Telangana, Andhra Pradesh, Tamil Nadu, and Kerala. HD streaming with photo galleries by ${settings.companyName || 'EventLive Pro'}.`,
    300
  );
  const canonical = absoluteUrl(siteUrl, '/districts');

  return (
    <>
      <PageSeo
        title={title}
        description={description}
        canonical={canonical}
        image={settings.seo?.defaultOgImage || settings.companyLogo}
        siteName={settings.companyName || 'EventLive Pro'}
        gscVerification={settings.googleSearchConsoleVerification}
        jsonLd={[
          buildOrganizationJsonLd(settings, siteUrl),
          buildWebsiteJsonLd(settings, siteUrl),
          buildLocalBusinessJsonLd(settings, siteUrl),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: siteUrl },
            { name: 'Districts', url: canonical },
          ]),
        ]}
      />

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold text-slate-900">Wedding streaming by district</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Discover live and upcoming wedding streams across South India. Each district page lists
          celebrations streamed in HD with shareable guest links.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {DISTRICTS.map((d) => (
            <Link
              key={d.slug}
              to={`/districts/${d.slug}`}
              className="card group transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-brand-700">
                {d.name}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{d.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">
                {counts[d.slug] != null ? `${counts[d.slug]} events` : 'View events'} →
              </p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
