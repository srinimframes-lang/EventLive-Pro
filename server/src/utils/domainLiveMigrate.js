/**
 * Safely move EventLivePro off an apex/root custom domain onto live.<apex>.
 * Never deletes the apex Domain row — suspends it so the existing website
 * on @ is not claimed by EventLive share URLs / CORS / tenant resolve.
 *
 * Does NOT change registrar DNS. Operator must add CNAME for live.<apex>.
 */
import { Domain } from '../models/Domain.js';
import {
  isApexHostname,
  recommendedLiveHostname,
  sanitizeHostname,
} from './dnsRecords.js';
import { refreshDomainCache } from './domainCache.js';
import { detachDomain } from './vercel.js';

/**
 * @param {import('mongoose').Document} apexDomain
 * @returns {Promise<{ apexDomain: object, liveDomain: object, createdLive: boolean, message: string }>}
 */
export async function migrateApexDomainToLiveSubdomain(apexDomain) {
  if (!apexDomain?.host) {
    throw new Error('Domain not found');
  }
  const apexHost = sanitizeHostname(apexDomain.host);
  if (!isApexHostname(apexHost)) {
    throw new Error(`${apexHost} is already a subdomain — no migration needed`);
  }

  const liveHost = recommendedLiveHostname(apexHost);
  let liveDomain = await Domain.findOne({ host: liveHost });
  let createdLive = false;

  if (!liveDomain) {
    liveDomain = await Domain.create({
      customer: apexDomain.customer,
      host: liveHost,
      status: 'pending',
      notes: `Created from apex ${apexHost} so EventLive does not take over the root website.`,
    });
    liveDomain.ensureVerifyToken();
    if (liveDomain.isModified('verifyToken')) await liveDomain.save();
    createdLive = true;
  } else if (String(liveDomain.customer) !== String(apexDomain.customer)) {
    throw new Error(`${liveHost} is registered to a different customer`);
  }

  // Disable EventLive mapping on the root — do not delete the row.
  const wasActive = apexDomain.status === 'active';
  if (apexDomain.status !== 'suspended') {
    apexDomain.status = 'suspended';
  }
  apexDomain.notes = [
    apexDomain.notes || '',
    `Suspended ${new Date().toISOString()}: keep ${apexHost} for the existing website; EventLive uses ${liveHost}.`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);

  // Detach apex from Vercel so SSL/hosting no longer targets the root site.
  if (apexDomain.hostingAttached || wasActive) {
    try {
      await detachDomain(apexHost);
      apexDomain.hostingAttached = false;
      apexDomain.hostingVerified = false;
    } catch {
      /* best-effort */
    }
  }
  await apexDomain.save();
  await refreshDomainCache();

  return {
    apexDomain,
    liveDomain,
    createdLive,
    message: createdLive
      ? `Suspended ${apexHost} for EventLive. Added ${liveHost} — add DNS CNAME for live, then Verify.`
      : `Suspended ${apexHost} for EventLive. Continue with existing ${liveHost}.`,
  };
}

/**
 * Optional one-shot: migrate a specific apex host if present.
 * Gated by caller (script / admin). Never runs automatically on boot.
 */
export async function migrateNamedApexIfPresent(apexHost) {
  const host = sanitizeHostname(apexHost);
  if (!host || !isApexHostname(host)) return null;
  const domain = await Domain.findOne({ host });
  if (!domain) return null;
  if (domain.status === 'suspended') {
    const liveHost = recommendedLiveHostname(host);
    const live = await Domain.findOne({ host: liveHost });
    return {
      skipped: true,
      message: `${host} already suspended`,
      liveDomain: live,
      apexDomain: domain,
    };
  }
  return migrateApexDomainToLiveSubdomain(domain);
}
