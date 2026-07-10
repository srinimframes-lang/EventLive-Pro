import { Banner, BANNER_LOCATIONS } from '../models/Banner.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertBannerFile } from '../utils/bannerMedia.js';
import { normalizeFitMode, normalizeSizePreset } from '../utils/bannerSizes.js';
import { persistBannerUpload, removeBannerUpload } from '../utils/storage.js';

function activeBannerQuery(location) {
  const now = new Date();
  const query = {
    enabled: true,
    locations: location,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  };
  return query;
}

function parseLocations(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((l) => BANNER_LOCATIONS.includes(l));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((l) => BANNER_LOCATIONS.includes(l));
    } catch {
      return value.split(',').map((s) => s.trim()).filter((l) => BANNER_LOCATIONS.includes(l));
    }
  }
  return [];
}

function parseDate(value) {
  if (value === '' || value === null || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bannerPayloadFromBody(body) {
  const payload = {};
  if (body.companyName !== undefined) payload.companyName = String(body.companyName).trim();
  if (body.clickUrl !== undefined) payload.clickUrl = String(body.clickUrl).trim();
  if (body.phoneNumber !== undefined) payload.phoneNumber = String(body.phoneNumber).trim();
  if (body.whatsappNumber !== undefined) payload.whatsappNumber = String(body.whatsappNumber).trim();
  if (body.sizePreset !== undefined) {
    payload.sizePreset = normalizeSizePreset(body.sizePreset, body.mobileSize);
  }
  if (body.mobileSize !== undefined) {
    payload.mobileSize = body.mobileSize === '100' ? '100' : '50';
    if (body.sizePreset === undefined) {
      payload.sizePreset = normalizeSizePreset(undefined, payload.mobileSize);
    }
  }
  if (body.fitMode !== undefined) payload.fitMode = normalizeFitMode(body.fitMode);
  if (body.locations !== undefined) payload.locations = parseLocations(body.locations);
  if (body.startDate !== undefined) payload.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) payload.endDate = parseDate(body.endDate);
  if (body.enabled !== undefined) payload.enabled = body.enabled === true || body.enabled === 'true';
  if (body.priority !== undefined) payload.priority = Number(body.priority) || 0;
  return payload;
}

/**
 * @route GET /api/banners
 * @desc  Active banners for a page location (public)
 */
export const listActiveBanners = asyncHandler(async (req, res) => {
  const location = String(req.query.location || '').trim();
  if (!BANNER_LOCATIONS.includes(location)) {
    res.status(400);
    throw new Error(`Invalid location. Use one of: ${BANNER_LOCATIONS.join(', ')}`);
  }

  const banners = await Banner.find(activeBannerQuery(location))
    .sort({ priority: -1, createdAt: -1 })
    .select('companyName imageUrl mediaType sizePreset fitMode mobileSize clickUrl phoneNumber whatsappNumber priority')
    .lean();

  res.status(200).json({ success: true, data: banners });
});

/**
 * @route POST /api/banners/:id/view
 */
export const trackBannerView = asyncHandler(async (req, res) => {
  const updated = await Banner.findByIdAndUpdate(
    req.params.id,
    { $inc: { views: 1 } },
    { new: true }
  ).select('views');
  if (!updated) {
    res.status(404);
    throw new Error('Banner not found');
  }
  res.status(200).json({ success: true, data: { views: updated.views } });
});

/**
 * @route POST /api/banners/:id/click
 */
export const trackBannerClick = asyncHandler(async (req, res) => {
  const updated = await Banner.findByIdAndUpdate(
    req.params.id,
    { $inc: { clicks: 1 } },
    { new: true }
  ).select('clicks clickUrl phoneNumber whatsappNumber');
  if (!updated) {
    res.status(404);
    throw new Error('Banner not found');
  }
  res.status(200).json({
    success: true,
    data: {
      clicks: updated.clicks,
      clickUrl: updated.clickUrl,
      phoneNumber: updated.phoneNumber,
      whatsappNumber: updated.whatsappNumber,
    },
  });
});

/**
 * @route GET /api/admin/banners
 */
export const adminListBanners = asyncHandler(async (_req, res) => {
  const banners = await Banner.find().sort({ priority: -1, createdAt: -1 });
  res.status(200).json({ success: true, data: banners });
});

/**
 * @route POST /api/admin/banners
 */
export const adminCreateBanner = asyncHandler(async (req, res) => {
  const mediaType = assertBannerFile(req.file);

  const payload = bannerPayloadFromBody(req.body);
  if (!payload.companyName) {
    res.status(400);
    throw new Error('Company name is required');
  }

  const { url, mediaType: storedType } = await persistBannerUpload(req.file);
  payload.imageUrl = url;
  payload.mediaType = storedType || mediaType;

  const banner = await Banner.create(payload);
  // eslint-disable-next-line no-console
  console.info(`[banners] created id=${banner._id} type=${banner.mediaType} company=${banner.companyName}`);
  res.status(201).json({ success: true, data: banner });
});

/**
 * @route PATCH /api/admin/banners/:id
 */
export const adminUpdateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  const payload = bannerPayloadFromBody(req.body);
  if (payload.companyName === '') {
    res.status(400);
    throw new Error('Company name is required');
  }

  Object.assign(banner, payload);
  await banner.save();
  // eslint-disable-next-line no-console
  console.info(`[banners] updated id=${banner._id}`);
  res.status(200).json({ success: true, data: banner });
});

/**
 * @route POST /api/admin/banners/:id/image
 */
export const adminUploadBannerImage = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  const mediaType = assertBannerFile(req.file);

  const previous = banner.imageUrl;
  const previousType = banner.mediaType;
  const { url, mediaType: storedType } = await persistBannerUpload(req.file);
  banner.imageUrl = url;
  banner.mediaType = storedType || mediaType;
  await banner.save();

  if (previous && previous !== banner.imageUrl) {
    removeBannerUpload(previous, previousType).catch(() => {});
  }
  res.status(200).json({ success: true, data: banner });
});

/**
 * @route DELETE /api/admin/banners/:id
 */
export const adminDeleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }
  if (banner.imageUrl) {
    removeBannerUpload(banner.imageUrl, banner.mediaType).catch(() => {});
  }
  // eslint-disable-next-line no-console
  console.info(`[banners] deleted id=${req.params.id}`);
  res.status(200).json({ success: true, data: { id: req.params.id } });
});
