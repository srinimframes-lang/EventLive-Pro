import { Domain } from '../models/Domain.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { checkDnsTxt } from '../utils/dnsVerify.js';
import { refreshDomainCache } from '../utils/domainCache.js';
import { attachDomain, detachDomain, getDomainStatus } from '../utils/vercel.js';
import { persistUpload, removeUpload } from '../utils/storage.js';

function normaliseHost(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:.*$/, '');
}

/**
 * @route GET /api/admin/domains
 * @desc  List every custom domain (with owner).
 * @access Private/Admin
 */
export const listDomains = asyncHandler(async (_req, res) => {
  const domains = await Domain.find()
    .populate('customer', 'name email')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: domains });
});

/**
 * @route POST /api/admin/domains
 * @desc  Super Admin registers a domain on behalf of a customer.
 * @access Private/Admin
 */
export const createDomain = asyncHandler(async (req, res) => {
  const host = normaliseHost(req.body.host);
  const customerId = req.body.customerId;
  if (!host || !customerId) {
    res.status(400);
    throw new Error('customerId and host are required');
  }
  const customer = await User.findById(customerId);
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  if (await Domain.findOne({ host })) {
    res.status(409);
    throw new Error('That domain is already registered');
  }
  const domain = await Domain.create({ customer: customerId, host });
  res.status(201).json({ success: true, data: domain });
});

/**
 * @route POST /api/admin/domains/:id/verify
 * @desc  Re-check DNS ownership (and Vercel status if enabled).
 * @access Private/Admin
 */
export const verifyDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }
  const { ok } = await checkDnsTxt(domain.host, domain.verifyToken);
  domain.dnsVerified = ok;
  domain.lastCheckedAt = new Date();
  if (ok && !domain.verifiedAt) domain.verifiedAt = new Date();

  const vstat = await getDomainStatus(domain.host);
  if (vstat.enabled) domain.sslStatus = vstat.ssl === 'issued' ? 'issued' : 'pending';

  await domain.save();
  res.status(200).json({ success: true, data: domain });
});

/**
 * @route POST /api/admin/domains/:id/approve
 * @desc  Approve + activate a domain. Requires DNS to be verified (re-checks if
 *        not yet). Attaches to Vercel when the integration is enabled.
 *        Body: { force?: boolean } to override the DNS gate.
 * @access Private/Admin
 */
export const approveDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }

  if (!domain.dnsVerified) {
    const { ok } = await checkDnsTxt(domain.host, domain.verifyToken);
    domain.dnsVerified = ok;
    domain.lastCheckedAt = new Date();
    if (ok) domain.verifiedAt = new Date();
  }
  if (!domain.dnsVerified && !req.body.force) {
    res.status(400);
    throw new Error('DNS ownership is not verified yet. Ask the customer to add the TXT record, or pass force.');
  }

  const attach = await attachDomain(domain.host);
  if (attach.enabled) {
    domain.hostingAttached = Boolean(attach.ok);
    const vstat = await getDomainStatus(domain.host);
    domain.sslStatus = vstat.enabled && vstat.ssl === 'issued' ? 'issued' : 'pending';
  } else {
    // Manual hosting: admin attaches the domain in Vercel's dashboard.
    domain.sslStatus = 'manual';
  }

  domain.status = 'active';
  await domain.save();
  await refreshDomainCache();
  res.status(200).json({ success: true, data: domain });
});

/**
 * @route POST /api/admin/domains/:id/suspend
 * @desc  Suspend (deactivate) a domain without deleting it.
 * @access Private/Admin
 */
export const suspendDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }
  domain.status = 'suspended';
  await domain.save();
  await refreshDomainCache();
  res.status(200).json({ success: true, data: domain });
});

/**
 * @route DELETE /api/admin/domains/:id
 * @desc  Remove a domain (detaches from Vercel when enabled).
 * @access Private/Admin
 */
export const removeDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }
  await detachDomain(domain.host);
  await domain.deleteOne();
  await refreshDomainCache();
  res.status(200).json({ success: true, data: { id: req.params.id } });
});

const BRANDING_FIELDS = [
  'businessName',
  'logoUrl',
  'tagline',
  'primaryColor',
  'whatsappNumber',
  'contactPhone',
  'contactEmail',
  'address',
  'footer',
];

/**
 * @route PATCH /api/admin/customers/:id/branding
 * @desc  Super Admin edits a customer's white-label branding.
 * @access Private/Admin
 */
export const updateCustomerBranding = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('Customer not found');
  }
  if (!user.branding) user.branding = {};
  for (const key of BRANDING_FIELDS) {
    if (req.body[key] !== undefined) user.branding[key] = req.body[key];
  }
  await user.save();
  res.status(200).json({ success: true, data: user });
});

/**
 * @route POST /api/admin/customers/:id/branding/logo
 * @desc  Super Admin uploads a customer's white-label logo.
 * @access Private/Admin
 */
export const uploadCustomerBrandingLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('Customer not found');
  }
  if (!user.branding) user.branding = {};
  if (user.branding.logoUrl) await removeUpload(user.branding.logoUrl);
  user.branding.logoUrl = await persistUpload(req.file);
  await user.save();
  res.status(201).json({ success: true, data: { logoUrl: user.branding.logoUrl } });
});
