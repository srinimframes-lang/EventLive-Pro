import { Settings } from '../models/Settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { persistUpload, removeUpload } from '../utils/storage.js';

/**
 * @route GET /api/settings
 * @desc  Public branding + payment details (used on Home, Booking, Watch pages)
 * @access Public
 */
export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.getSingleton();
  res.status(200).json({ success: true, data: settings });
});

/**
 * @route PATCH /api/settings
 * @desc  Update branding/contact/payment details (admin only)
 * @access Private/Admin
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  const b = req.body || {};

  const topLevel = [
    'companyName',
    'companyLogo',
    'tagline',
    'whatsappNumber',
    'contactPhone',
    'contactEmail',
    'address',
  ];
  for (const key of topLevel) {
    if (b[key] !== undefined) settings[key] = b[key];
  }

  if (b.creditPricing) {
    if (b.creditPricing.youtube !== undefined) {
      settings.creditPricing.youtube = Math.max(0, Number(b.creditPricing.youtube) || 0);
    }
    if (b.creditPricing.server !== undefined) {
      settings.creditPricing.server = Math.max(0, Number(b.creditPricing.server) || 0);
    }
  }

  if (b.payment) {
    const p = b.payment;
    const payFields = ['gpayNumber', 'phonepeNumber', 'paytmNumber', 'upiId', 'upiName', 'upiQr', 'instructions'];
    for (const key of payFields) {
      if (p[key] !== undefined) settings.payment[key] = p[key];
    }
    if (p.bank) {
      const bankFields = ['accountName', 'accountNumber', 'ifsc', 'bankName', 'branch'];
      for (const key of bankFields) {
        if (p.bank[key] !== undefined) settings.payment.bank[key] = p.bank[key];
      }
    }
  }

  await settings.save();
  res.status(200).json({ success: true, data: settings });
});

/**
 * @route POST /api/settings/logo
 * @desc  Upload company logo (admin only)
 * @access Private/Admin
 */
export const uploadCompanyLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }
  const settings = await Settings.getSingleton();
  if (settings.companyLogo) await removeUpload(settings.companyLogo);
  settings.companyLogo = await persistUpload(req.file);
  await settings.save();
  res.status(201).json({ success: true, data: { companyLogo: settings.companyLogo } });
});

/**
 * @route POST /api/settings/qr
 * @desc  Upload UPI QR code image (admin only)
 * @access Private/Admin
 */
export const uploadUpiQr = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }
  const settings = await Settings.getSingleton();
  if (settings.payment.upiQr) await removeUpload(settings.payment.upiQr);
  settings.payment.upiQr = await persistUpload(req.file);
  await settings.save();
  res.status(201).json({ success: true, data: { upiQr: settings.payment.upiQr } });
});
