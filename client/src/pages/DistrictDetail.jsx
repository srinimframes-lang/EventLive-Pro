import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EventCard from '../components/EventCard.jsx';
import PageSeo from '../components/seo/PageSeo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { districtBySlug } from '../utils/districts.js';
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildDistrictDescription,
  buildDistrictTitle,
  buildLocalBusinessJsonLd,
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
  getSiteOrigin,
  resolveSeoImage,
} from '../utils/seo.js';
import api from '../services/api.js';

export default function DistrictDetail() {
  const { slug } = useParams();
  const { settings } = useSettings();
  const district = districtBySlug(slug);
  const [state, setState] = useState({ events: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!district) return undefined;
    let active = true;
    setLoading(true);
    api
      .get(`/api/seo/districts/${district.slug}`)
      .then(({ data }) => {
        if (active) {
          setState({
            events: data.data.events || [],
            total: data.data.total || 0,
            page: data.data.page || 1,
            pages: data.data.pages || 1,
          });
        }
      })
      .catch((err) => active && setError(err.response?.data?.message || err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [district]);

  if (!district) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-slate-600">District not found.</p>
        <Link to="/districts" className="btn-ghost mt-4">
          All districts
        </Link>
      </div>
    );
  }

  const siteUrl = getSiteOrigin(settings);
  const canonical = absoluteUrl(siteUrl, `/districts/${district.slug}`);
  const title = buildDistrictTitle(district, settings);
  const description = buildDistrictDescription(district);
  const image = resolveSeoImage(settings.seo?.defaultOgImage || settings.companyLogo);

  return (
    <>
      <PageSeo
        title={title}
        description={description}
        canonical={canonical}
        image={image}
        siteName={settings.companyName || 'EventLive Pro'}
        gscVerification={settings.googleSearchConsoleVerification}
        jsonLd={[
          buildOrganizationJsonLd(settings, siteUrl),
          buildWebsiteJsonLd(settings, siteUrl),
          buildLocalBusinessJsonLd(settings, siteUrl),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: district.headline,
            description: district.description,
            url: canonical,
          },
          buildBreadcrumbJsonLd([
            { name: 'Home', url: siteUrl },
            { name: 'Districts', url: absoluteUrl(siteUrl, '/districts') },
            { name: district.name, url: canonical },
          ]),
        ]}
      />

      <div className="mx-auto max-w-6xl px-4 py-10">
        <Link to="/districts" className="text-sm text-brand-600 hover:underline">
          ← All districts
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold text-slate-900">{district.headline}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{district.description}</p>

        {error && (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {loading ? (
          <p className="mt-10 text-center text-slate-500">Loading events…</p>
        ) : state.events.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-slate-600">No public events in {district.name} yet.</p>
            <Link to="/events" className="btn-primary mt-4">
              Browse all events
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-500">{state.total} celebration{state.total !== 1 ? 's' : ''}</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {state.events.map((event) => (
                <EventCard key={event.id || event._id} event={event} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
