import { Router } from 'express';
import {
  getDistrictSeo,
  getEventSeoMeta,
  getSeoPreview,
  listDistrictSeo,
} from '../controllers/seo.controller.js';

const router = Router();

router.get('/preview', getSeoPreview);
router.get('/districts', listDistrictSeo);
router.get('/districts/:slug', getDistrictSeo);
router.get('/event/:idOrSlug', getEventSeoMeta);

export default router;
