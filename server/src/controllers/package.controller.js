import { Package } from '../models/Package.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const PACKAGE_FIELDS = [
  'name',
  'price',
  'currency',
  'description',
  'features',
  'durationLabel',
  'isActive',
  'sortOrder',
];

function pickFields(body) {
  const out = {};
  for (const f of PACKAGE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  if (typeof out.features === 'string') {
    out.features = out.features
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return out;
}

/**
 * @route GET /api/packages
 * @desc  List packages. Public callers see only active ones; admins see all.
 * @access Public
 */
export const listPackages = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' ? {} : { isActive: true };
  const packages = await Package.find(filter).sort({ sortOrder: 1, price: 1 });
  res.status(200).json({ success: true, data: packages });
});

/**
 * @route POST /api/packages  (admin)
 */
export const createPackage = asyncHandler(async (req, res) => {
  const data = pickFields(req.body);
  if (!data.name || data.price === undefined) {
    res.status(400);
    throw new Error('Package name and price are required');
  }
  const pkg = await Package.create(data);
  res.status(201).json({ success: true, data: pkg });
});

/**
 * @route PATCH /api/packages/:id  (admin)
 */
export const updatePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) {
    res.status(404);
    throw new Error('Package not found');
  }
  Object.assign(pkg, pickFields(req.body));
  await pkg.save();
  res.status(200).json({ success: true, data: pkg });
});

/**
 * @route DELETE /api/packages/:id  (admin)
 */
export const deletePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) {
    res.status(404);
    throw new Error('Package not found');
  }
  await pkg.deleteOne();
  res.status(200).json({ success: true, id: req.params.id });
});
