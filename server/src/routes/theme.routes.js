import { Router } from 'express';
import {
  listThemes,
  listThemeCategories,
  getTheme,
} from '../controllers/theme.controller.js';

const router = Router();

router.get('/categories', listThemeCategories);
router.get('/', listThemes);
router.get('/:idOrSlug', getTheme);

export default router;
