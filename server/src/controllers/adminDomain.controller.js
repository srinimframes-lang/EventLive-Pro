import { Domain } from '../models/Domain.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyDomainDns, checkDnsTxt, DNS_VERIFY_REASON } from '../utils/dnsVerify.js';
import { txtLookupName } from '../utils/dnsRecords.js';
import { refreshDomainCache } from '../utils/domainCache.js';
import { attachDomain, detachDomain, getDomainStatus } from '../utils/vercel.js';
import { persistUpload, removeUpload } from '../utils/storage.js';
import {
  assertOwnsRecord,
  createdByFilter,
  isPlatformAdmin,
} from '../utils/tenantScope.js';

function normaliseHost(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:.*$/, '');
}

/** Copies a Vercel status summary onto the domain document (does not save). */
function applyVercelStatus(domain, vstat) {
  if (!vstat || !vstat.enabled) return;
  if (vstat.attached !== undefined) domain.hostingAttached = Boolean(vstat.attached);
  domain.hostingVerified = Boolean(vstat.verified);
  if (Array.isArray(vstat.verification)) domain.hostingRecords = vstat.verification;
  domain.sslStatus = vstat.ssl === 'issued' ? 'issued' : 'pending';
}

async function assertDomainAccess(domain, adminUser, res) {
  if (isPlatformAdmin(adminUser)) return;
  const customer = await User.findById(domain.customer).select('createdBy role');
  if (!customer) {
    res.status(404);
    throw new Error('Domain not found');
  }
  assertOwnsRecord(customer, adminUser, res, 'domain');
}

async function findScopedCustomerForDomain(customerId, adminUser, res) {
  const customer = await User.findById(customerId);
  if (!customer || customer.role === 'admin' || customer.role === 'superadmin') {
    res.status(404);
    throw new Error('Customer not found');
  }
  assertOwnsRecord(customer, adminUser, res, 'customer');
  return customer;
}

/**
 * @route GET /api/admin/domains/integration
 * @desc  Whether the automatic Vercel domain integration is configured.
 * @access Private/Admin
 */
export const getIntegrationStatus = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      vercel: {
        enabled: env.vercel.enabled,
        projectId: env.vercel.projectId ? `${env.vercel.projectId.slice(0, 6)}…` : '',
        team: Boolean(env.vercel.teamId),
      },
    },
  });
});

/**
 * @route GET /api/admin/domains
 * @desc  List custom domains for this tenant (or all for Super Admin).
 * @access Private/Admin
 */
export const listDomains = asyncHandler(async (req, res) => {
  let query = Domain.find();
  if (!isPlatformAdmin(req.user)) {
    const customerIds = (
      await User.find({
        role: { $in: ['customer', 'user', 'organizer'] },
        ...createdByFilter(req.user),
      }).select('_id')
    ).map((u) => u._id);
    query = Domain.find({ customer: { $in: customerIds } });
  }
  const domains = await query.populate('customer', 'name email').sort({ createdAt: -1 });
  // Ensure verifyToken exists and verification virtual is serialized for the admin UI.
  const data = [];
  for (const domain of domains) {
    domain.ensureVerifyToken();
    if (domain.isModified('verifyToken')) await domain.save();
    data.push(domain.toJSON());
  }
  res.status(200).json({ success: true, data });
});

/**
 * @route POST /api/admin/domains
 * @desc  Admin registers a domain on behalf of a customer in their tenant.
 * @access Private/Admin
 */
export const createDomain = asyncHandler(async (req, res) => {
  const host = normaliseHost(req.body.host);
  const customerId = req.body.customerId;
  if (!host || !customerId) {
    res.status(400);
    throw new Error('customerId and host are required');
  }
  await findScopedCustomerForDomain(customerId, req.user, res);
  if (await Domain.findOne({ host })) {
    res.status(409);
    throw new Error('That domain is already registered');
  }
  const domain = await Domain.create({ customer: customerId, host });
  domain.ensureVerifyToken();
  if (domain.isModified('verifyToken')) await domain.save();
  res.status(201).json({ success: true, data: domain });
});

function buildVerifyPayload(domain, dnsCheck) {
  const reasons = [...(dnsCheck.reasons || [])];
  let reason = dnsCheck.reason || null;
  let message = dnsCheck.message || '';

  if (dnsCheck.ok) {
    if (domain.sslStatus === 'pending') {
      reasons.push(DNS_VERIFY_REASON.SSL_PENDING);
      reason = reason || DNS_VERIFY_REASON.SSL_PENDING;
      message =
        'DNS verified. Custom domain attached and tenant cache refreshed. SSL is pending — it usually finishes within a few minutes.';
    } else if (domain.sslStatus === 'manual') {
      message =
        'DNS verified. Custom domain attached and tenant cache refreshed. SSL is set to manual — attach the domain in your host dashboard if needed.';
    } else {
      message =
        'DNS verified successfully. Custom domain is active, tenant cache refreshed, and SSL is enabled.';
    }
  } else if (!message) {
    message = reason || 'DNS verification failed';
  }

  return {
    success: true,
    data: domain,
    message,
    dnsCheck: {
      ok: Boolean(dnsCheck.ok),
      reason,
      reasons,
      message,
      lookedUp: dnsCheck.lookedUp || txtLookupName(domain.host),
      expected: domain.verifyToken,
      found: dnsCheck.found || dnsCheck.txt?.found || [],
      authoritative: Boolean(dnsCheck.authoritative),
      txt: dnsCheck.txt || null,
      cname: dnsCheck.cname || null,
      sslStatus: domain.sslStatus,
      debug: dnsCheck.debug || null,
    },
  };
}

/**
 * @route POST /api/admin/domains/:id/verify
 * @desc  Re-check DNS ownership (and Vercel status if enabled).
 * @access Private/Admin
 */
export const verifyDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id).populate('customer', 'name email');
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }
  await assertDomainAccess(domain, req.user, res);

  domain.ensureVerifyToken();

  let dnsCheck;
  try {
    dnsCheck = await verifyDomainDns(domain.host, domain.verifyToken);
  } catch (err) {
    dnsCheck = {
      ok: false,
      reason: DNS_VERIFY_REASON.NETWORK,
      reasons: [DNS_VERIFY_REASON.NETWORK],
      message: `Network error during DNS verification: ${err.message || 'lookup failed'}`,
      found: [],
      lookedUp: txtLookupName(domain.host),
    };
  }

  // eslint-disable-next-line no-console
  console.log(
    '[verifyDomain] dnsCheck',
    JSON.stringify(
      {
        host: domain.host,
        lookedUp: dnsCheck.lookedUp,
        expected: domain.verifyToken,
        ok: dnsCheck.ok,
        reason: dnsCheck.reason,
        found: dnsCheck.found,
        matchingSources: dnsCheck.matchingSources,
        debug: dnsCheck.debug,
        message: dnsCheck.message,
      },
      null,
      2
    )
  );

  domain.dnsVerified = Boolean(dnsCheck.ok);
  domain.lastCheckedAt = new Date();
  if (dnsCheck.ok && !domain.verifiedAt) domain.verifiedAt = new Date();

  // Once ownership is proven: attach domain, refresh cache, start SSL.
  if (dnsCheck.ok) {
    if (env.vercel.enabled && !domain.hostingAttached) {
      const attach = await attachDomain(domain.host);
      if (attach.enabled && attach.ok) domain.hostingAttached = true;
      if (Array.isArray(attach.verification) && attach.verification.length) {
        domain.hostingRecords = attach.verification;
      }
    } else if (!env.vercel.enabled && domain.sslStatus === 'pending') {
      domain.sslStatus = 'manual';
    }
    applyVercelStatus(domain, await getDomainStatus(domain.host));
    if (domain.status !== 'active' && domain.status !== 'suspended') {
      domain.status = 'active';
    }
    await refreshDomainCache();
  } else {
    applyVercelStatus(domain, await getDomainStatus(domain.host));
  }

  await domain.save();
  const payload = buildVerifyPayload(domain, dnsCheck);
  // eslint-disable-next-line no-console
  console.log('[verifyDomain] response.dnsCheck', JSON.stringify(payload.dnsCheck, null, 2));
  res.status(200).json(payload);
});

/**
 * @route POST /api/admin/domains/:id/refresh
 * @desc  Re-read the live Vercel verification/SSL status for a domain.
 * @access Private/Admin
 */
export const refreshDomainStatus = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }
  await assertDomainAccess(domain, req.user, res);
  applyVercelStatus(domain, await getDomainStatus(domain.host));
  domain.lastCheckedAt = new Date();
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
  await assertDomainAccess(domain, req.user, res);

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
    if (Array.isArray(attach.verification) && attach.verification.length) {
      domain.hostingRecords = attach.verification;
    }
    applyVercelStatus(domain, await getDomainStatus(domain.host));
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
  await assertDomainAccess(domain, req.user, res);
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
  await assertDomainAccess(domain, req.user, res);
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
  'disableBranding',
];

/**
 * @route PATCH /api/admin/customers/:id/branding
 * @desc  Super Admin edits a customer's white-label branding.
 * @access Private/Admin
 */
export const updateCustomerBranding = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role === 'admin' || user.role === 'superadmin') {
    res.status(404);
    throw new Error('Customer not found');
  }
  assertOwnsRecord(user, req.user, res, 'customer');
  if (!user.branding) user.branding = {};
  for (const key of BRANDING_FIELDS) {
    if (req.body[key] === undefined) continue;
    if (key === 'disableBranding') {
      user.branding.disableBranding = Boolean(req.body.disableBranding);
    } else {
      user.branding[key] = req.body[key];
    }
  }
  await user.save();
  res.status(200).json({ success: true, data: user });
});

/**
 * @route POST /api/admin/customers/:id/branding/logo
 * @desc  Admin uploads a customer's white-label logo.
 * @access Private/Admin
 */
export const uploadCustomerBrandingLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image was uploaded');
  }
  const user = await User.findById(req.params.id);
  if (!user || user.role === 'admin' || user.role === 'superadmin') {
    res.status(404);
    throw new Error('Customer not found');
  }
  assertOwnsRecord(user, req.user, res, 'customer');
  if (!user.branding) user.branding = {};
  if (user.branding.logoUrl) await removeUpload(user.branding.logoUrl);
  user.branding.logoUrl = await persistUpload(req.file);
  await user.save();
  res.status(201).json({ success: true, data: { logoUrl: user.branding.logoUrl } });
});
