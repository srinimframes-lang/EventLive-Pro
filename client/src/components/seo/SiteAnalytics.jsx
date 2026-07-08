import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSettings } from '../../context/SettingsContext.jsx';

/**
 * Loads Google Analytics 4 when an ID is configured in admin settings.
 */
export default function SiteAnalytics() {
  const { settings } = useSettings();
  const gaId = (settings?.googleAnalyticsId || '').trim();

  useEffect(() => {
    if (!gaId || typeof window === 'undefined') return undefined;

    window.dataLayer = window.dataLayer || [];
    function gtag(...args) {
      window.dataLayer.push(args);
    }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', gaId, { send_page_view: false });

    return undefined;
  }, [gaId]);

  if (!gaId) return null;

  return (
    <Helmet>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
    </Helmet>
  );
}

/**
 * Fires a GA4 page_view on route changes. Mount inside Router.
 */
export function useGaPageView(pathname) {
  const { settings } = useSettings();
  const gaId = (settings?.googleAnalyticsId || '').trim();

  useEffect(() => {
    if (!gaId || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_path: pathname,
      page_title: document.title,
    });
  }, [pathname, gaId]);
}
