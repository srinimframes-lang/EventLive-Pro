import { Domain } from '../models/Domain.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { checkDnsTxt } from '../utils/dnsVerify.js';
import { persistUpload, removeUpload } from '../utils/storage.js';
import { refreshDomainCache } from '../utils/domainCache.js';
import { attachDomain, getDomainStatus } from '../utils/vercel.js';

const MAX_DOMAINS_PER_CUSTOMER = 10;

/** Public-safe branding payload for a customer (used to theme their site). */
export function publicBranding(user) {
  const b = user?.branding || {};
  return {
    businessName: b.businessName || '',
    logoUrl: b.logoUrl || '',
    tagline: b.tagline || '',
    primaryColor: b.primaryColor || '',
    whatsappNumber: b.whatsappNumber || '',
    contactPhone: b.contactPhone || '',
    contactEmail: b.contactEmail || '',
    address: b.address || '',
    footer: b.footer || '',
  };
}

function normaliseHost(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:.*$/, '');
}

/**
 * @route GET /api/tenant/resolve?host=<host>
 * @desc  Resolve an incoming host to a customer's branding. Returns
 *        { isCustom:false } for the platform's own domains / unknown hosts.
 * @access Public
 */
export const resolveByHost = asyncHandler(async (req, res) => {
  const host = normaliseHost(req.query.host || req.hostname);
  if (!host) return res.status(200).json({ success: true, data: { isCustom: false } });

  const domain = await Domain.findOne({ host, status: 'active' }).populate('customer');
  if (!domain || !domain.customer) {
    return res.status(200).json({ success: true, data: { isCustom: false } });
  }
  return res.status(200).json({
    success: true,
    data: {
      isCustom: true,
      host,
      customerId: domain.customer.id,
      branding: publicBranding(domain.customer),
    },
  });
});

/**
 * @route GET /api/tenant/my-domains
 * @desc  List the authenticated customer's domains + the active one (if any).
 * @access Private
 */
export const myDomains = asyncHandler(async (req, res) => {
  const domains = await Domain.find({ customer: req.user._id }).sort({ createdAt: -1 });
  const payload = [];
  for (const domain of domains) {
    domain.ensureVerifyToken();
    if (domain.isModified('verifyToken')) await domain.save();
    payload.push(domain.toJSON());
  }
  const active = payload.find((d) => d.status === 'active');
  res.status(200).json({
    success: true,
    data: { domains: payload, activeHost: active ? active.host : '' },
  });
});

/**
 * @route POST /api/tenant/my-domains
 * @desc  Customer registers a new custom domain (starts pending).
 * @access Private
 */
export const addMyDomain = asyncHandler(async (req, res) => {
  const host = normaliseHost(req.body.host);
  if (!host) {
    res.status(400);
    throw new Error('Enter a domain like live.yourbusiness.com');
  }
  const count = await Domain.countDocuments({ customer: req.user._id });
  if (count >= MAX_DOMAINS_PER_CUSTOMER) {
    res.status(400);
    throw new Error('Domain limit reached. Contact support to add more.');
  }
  const existing = await Domain.findOne({ host });
  if (existing) {
    res.status(409);
    throw new Error('That domain is already registered.');
  }
  const domain = await Domain.create({ customer: req.user._id, host });
  domain.ensureVerifyToken();
  if (domain.isModified('verifyToken')) await domain.save();
  res.status(201).json({ success: true, data: domain });
});

/**
 * @route POST /api/tenant/my-domains/:id/verify
 * @desc  Customer triggers a DNS ownership check for their own domain.
 *        On success: mark verified, start SSL attach, activate routing.
 * @access Private
 */
export const verifyMyDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findOne({ _id: req.params.id, customer: req.user._id });
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }

  domain.ensureVerifyToken();
  const dnsCheck = await checkDnsTxt(domain.host, domain.verifyToken);
  domain.dnsVerified = dnsCheck.ok;
  domain.lastCheckedAt = new Date();
  if (dnsCheck.ok && !domain.verifiedAt) domain.verifiedAt = new Date();

  if (dnsCheck.ok) {
    if (env.vercel.enabled) {
      const attach = await attachDomain(domain.host);
      if (attach.enabled && attach.ok) domain.hostingAttached = true;
      if (Array.isArray(attach.verification) && attach.verification.length) {
        domain.hostingRecords = attach.verification;
      }
      const vstat = await getDomainStatus(domain.host);
      if (vstat?.enabled) {
        domain.hostingVerified = Boolean(vstat.verified);
        if (Array.isArray(vstat.verification)) domain.hostingRecords = vstat.verification;
        domain.sslStatus = vstat.ssl === 'issued' ? 'issued' : 'pending';
      }
    } else if (domain.sslStatus === 'pending') {
      domain.sslStatus = 'manual';
    }
    if (domain.status !== 'active' && domain.status !== 'suspended') {
      domain.status = 'active';
    }
    await refreshDomainCache();
  }

  await domain.save();
  res.status(200).json({
    success: true,
    data: domain,
    message: dnsCheck.ok
      ? 'DNS verified. Your domain is active and SSL provisioning has started.'
      : 'TXT record not found yet. Add the DNS records shown below, wait for propagation, then try again.',
    dnsCheck: {
      ok: dnsCheck.ok,
      lookedUp: `_eventlive-verify.${domain.host}`,
      expected: domain.verifyToken,
      found: dnsCheck.found,
    },
  });
});

/**
 * @route DELETE /api/tenant/my-domains/:id
 * @desc  Customer removes their own domain.
 * @access Private
 */
export const deleteMyDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findOneAndDelete({ _id: req.params.id, customer: req.user._id });
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }
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
 * @route PATCH /api/tenant/my-branding
 * @desc  Customer updates their own white-label branding.
 * @access Private
 */
export const updateMyBranding = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.branding) user.branding = {};
  for (const key of BRANDING_FIELDS) {
    if (req.body[key] !== undefined) user.branding[key] = req.body[key];
  }
  await user.save();
  res.status(200).json({ success: true, data: publicBranding(user) });
});

/**
 * @route POST /api/tenant/my-branding/logo
 * @desc  Customer uploads their white-label logo.
 * @access Private
 */
export const uploadMyBrandingLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }
  const user = await User.findById(req.user._id);
  if (!user.branding) user.branding = {};
  if (user.branding.logoUrl) await removeUpload(user.branding.logoUrl);
  user.branding.logoUrl = await persistUpload(req.file);
  await user.save();
  res.status(201).json({ success: true, data: { logoUrl: user.branding.logoUrl } });
});
