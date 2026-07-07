import { Router } from 'express';
import {
  listThemes,
  listThemeCategories,
  listThemeRegions,
  getTheme,
} from '../controllers/theme.controller.js';

const router = Router();

router.get('/categories', listThemeCategories);
router.get('/regions', listThemeRegions);
router.get('/', listThemes);
router.get('/:idOrSlug', getTheme);

export default router;
