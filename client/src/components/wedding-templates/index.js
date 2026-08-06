import { lazy } from 'react';
import { CLASSIC_WEDDING_ID, resolveWeddingTemplateId } from './registry.js';

const ClassicWeddingPage = lazy(() => import('../classic-wedding/ClassicWeddingPage.jsx'));
const MandapGardenPage = lazy(() => import('./MandapGardenPage.jsx'));
const RoyalIvoryPage = lazy(() => import('./RoyalIvoryPage.jsx'));
const MarigoldFestivePage = lazy(() => import('./MarigoldFestivePage.jsx'));
const MoonlightPalacePage = lazy(() => import('./MoonlightPalacePage.jsx'));
const TempleBellsPage = lazy(() => import('./TempleBellsPage.jsx'));

const COMPONENT_MAP = {
  [CLASSIC_WEDDING_ID]: ClassicWeddingPage,
  'mandap-garden': MandapGardenPage,
  'royal-ivory': RoyalIvoryPage,
  'marigold-festive': MarigoldFestivePage,
  'moonlight-palace': MoonlightPalacePage,
  'temple-bells': TempleBellsPage,
};

/** Resolve the watch-page component for a classic-wedding event (incl. new variants). */
export function resolveWeddingTemplateComponent(event) {
  const id = resolveWeddingTemplateId(event) || CLASSIC_WEDDING_ID;
  return COMPONENT_MAP[id] || ClassicWeddingPage;
}

export { resolveWeddingTemplateId, CLASSIC_WEDDING_ID };
