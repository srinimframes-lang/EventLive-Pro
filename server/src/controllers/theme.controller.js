import { Theme, THEME_CATEGORIES, THEME_REGIONS } from '../models/Theme.js';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { persistUpload, removeUpload } from '../utils/storage.js';
import { seedRegionalThemes } from '../config/seedRegionalThemes.js';

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
  if (req.query.region && THEME_REGIONS.includes(req.query.region)) {
    filter.region = req.query.region;
  }
  const themes = await Theme.find(filter).sort({ sortOrder: 1, category: 1, name: 1 });
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
 * @route GET /api/themes/regions
 * @desc  South Indian regional theme counts by state
 * @access Public
 */
export const listThemeRegions = asyncHandler(async (_req, res) => {
  const counts = await Theme.aggregate([
    { $match: { isActive: true, region: { $in: THEME_REGIONS } } },
    { $group: { _id: '$region', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const data = THEME_REGIONS.map((id) => ({ id, count: map[id] || 0 }));
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
  if (req.query.region && THEME_REGIONS.includes(req.query.region)) {
    filter.region = req.query.region;
  }
  const themes = await Theme.find(filter).sort({ sortOrder: 1, category: 1, name: 1 });
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
    region: b.region && THEME_REGIONS.includes(b.region) ? b.region : undefined,
    description: b.description || '',
    backgroundImage: b.backgroundImage || '',
    colors: b.colors || {},
    fonts: b.fonts || {},
    style: b.style || {},
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
  const top = ['name', 'category', 'region', 'description', 'backgroundImage', 'heroLabel', 'footerText', 'isPremium', 'isActive', 'sortOrder'];
  for (const key of top) {
    if (b[key] !== undefined) theme[key] = b[key];
  }
  if (b.region === '' || b.region === null) theme.region = undefined;
  if (b.slug) theme.slug = slugify(b.slug);
  if (b.colors) Object.assign(theme.colors, b.colors);
  if (b.fonts) Object.assign(theme.fonts, b.fonts);
  if (b.style) Object.assign(theme.style, b.style);
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

/**
 * @route POST /api/admin/themes/:id/duplicate
 * @desc  Duplicate a theme as a new inactive copy
 * @access Private/Admin
 */
export const duplicateTheme = asyncHandler(async (req, res) => {
  const source = await Theme.findById(req.params.id);
  if (!source) {
    res.status(404);
    throw new Error('Theme not found');
  }
  const base = slugify(`${source.slug}-copy`);
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Theme.findOne({ slug })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  const theme = await Theme.create({
    name: `${source.name} (Copy)`,
    slug,
    category: source.category,
    region: source.region,
    description: source.description,
    backgroundImage: source.backgroundImage,
    colors: source.colors?.toObject?.() || source.colors,
    fonts: source.fonts?.toObject?.() || source.fonts,
    style: source.style?.toObject?.() || source.style,
    heroLabel: source.heroLabel,
    footerText: source.footerText,
    isPremium: source.isPremium,
    isActive: false,
    sortOrder: (source.sortOrder || 0) + 1,
  });
  res.status(201).json({ success: true, data: theme });
});

/**
 * @route POST /api/admin/themes/reseed-regional
 * @desc  Upsert all South Indian regional themes (idempotent)
 * @access Private/Admin
 */
export const reseedRegionalThemes = asyncHandler(async (_req, res) => {
  await seedRegionalThemes();
  const count = await Theme.countDocuments({ region: { $in: THEME_REGIONS }, isActive: true });
  res.status(200).json({ success: true, data: { regionalCount: count } });
});

/** Helper used by event controller to copy theme into event snapshot. */
export async function snapshotTheme(themeId) {
  if (!themeId) return null;
  const theme = await Theme.findById(themeId);
  if (!theme || !theme.isActive) return null;
  return theme.toSnapshot();
}
