import { Theme, THEME_CATEGORIES } from '../models/Theme.js';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { persistUpload, removeUpload } from '../utils/storage.js';

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @route GET /api/themes
 * @desc  List active themes (optionally filter by category)
 * @access Public
 */
export const listThemes = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category && THEME_CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }
  const themes = await Theme.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });
  res.status(200).json({ success: true, data: themes });
});

/**
 * @route GET /api/themes/categories
 * @desc  Theme category list with counts
 * @access Public
 */
export const listThemeCategories = asyncHandler(async (_req, res) => {
  const counts = await Theme.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const data = THEME_CATEGORIES.map((id) => ({ id, count: map[id] || 0 }));
  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/themes/:idOrSlug
 * @desc  Get a single theme by id or slug
 * @access Public
 */
export const getTheme = asyncHandler(async (req, res) => {
  const raw = req.params.idOrSlug;
  const query = mongoose.isValidObjectId(raw)
    ? { $or: [{ _id: raw }, { slug: raw.toLowerCase() }] }
    : { slug: raw.toLowerCase() };
  const theme = await Theme.findOne(query);
  if (!theme) {
    res.status(404);
    throw new Error('Theme not found');
  }
  res.status(200).json({ success: true, data: theme });
});

// ── Admin ─────────────────────────────────────────────────────

/**
 * @route GET /api/admin/themes
 * @desc  List all themes (including inactive)
 * @access Private/Admin
 */
export const adminListThemes = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category && THEME_CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }
  const themes = await Theme.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });
  res.status(200).json({ success: true, data: themes });
});

/**
 * @route POST /api/admin/themes
 * @desc  Create a theme
 * @access Private/Admin
 */
export const createTheme = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category) {
    res.status(400);
    throw new Error('Name and category are required');
  }
  const slug = slugify(b.slug || b.name);
  if (await Theme.findOne({ slug })) {
    res.status(409);
    throw new Error('A theme with that slug already exists');
  }
  const theme = await Theme.create({
    name: b.name,
    slug,
    category: b.category,
    description: b.description || '',
    backgroundImage: b.backgroundImage || '',
    colors: b.colors || {},
    fonts: b.fonts || {},
    heroLabel: b.heroLabel || 'Live',
    footerText: b.footerText || '',
    isPremium: b.isPremium !== false,
    isActive: b.isActive !== false,
    sortOrder: Number(b.sortOrder) || 0,
  });
  res.status(201).json({ success: true, data: theme });
});

/**
 * @route PATCH /api/admin/themes/:id
 * @desc  Update a theme (does not affect existing event snapshots)
 * @access Private/Admin
 */
export const updateTheme = asyncHandler(async (req, res) => {
  const theme = await Theme.findById(req.params.id);
  if (!theme) {
    res.status(404);
    throw new Error('Theme not found');
  }
  const b = req.body || {};
  const top = ['name', 'category', 'description', 'backgroundImage', 'heroLabel', 'footerText', 'isPremium', 'isActive', 'sortOrder'];
  for (const key of top) {
    if (b[key] !== undefined) theme[key] = b[key];
  }
  if (b.slug) theme.slug = slugify(b.slug);
  if (b.colors) Object.assign(theme.colors, b.colors);
  if (b.fonts) Object.assign(theme.fonts, b.fonts);
  await theme.save();
  res.status(200).json({ success: true, data: theme });
});

/**
 * @route DELETE /api/admin/themes/:id
 * @desc  Delete a theme (existing events keep their snapshot)
 * @access Private/Admin
 */
export const deleteTheme = asyncHandler(async (req, res) => {
  const theme = await Theme.findById(req.params.id);
  if (!theme) {
    res.status(404);
    throw new Error('Theme not found');
  }
  if (theme.backgroundImage?.startsWith('/uploads/')) {
    await removeUpload(theme.backgroundImage);
  }
  await theme.deleteOne();
  res.status(200).json({ success: true, data: { id: req.params.id } });
});

/**
 * @route POST /api/admin/themes/:id/background
 * @desc  Upload theme background image
 * @access Private/Admin
 */
export const uploadThemeBackground = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }
  const theme = await Theme.findById(req.params.id);
  if (!theme) {
    res.status(404);
    throw new Error('Theme not found');
  }
  if (theme.backgroundImage?.startsWith('/uploads/')) {
    await removeUpload(theme.backgroundImage);
  }
  theme.backgroundImage = await persistUpload(req.file);
  await theme.save();
  res.status(201).json({ success: true, data: { backgroundImage: theme.backgroundImage } });
});

/** Helper used by event controller to copy theme into event snapshot. */
export async function snapshotTheme(themeId) {
  if (!themeId) return null;
  const theme = await Theme.findById(themeId);
  if (!theme || !theme.isActive) return null;
  return theme.toSnapshot();
}
