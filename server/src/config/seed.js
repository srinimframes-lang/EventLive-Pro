import { env } from './env.js';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
import { Package } from '../models/Package.js';
import { Payment } from '../models/Payment.js';
import { Event } from '../models/Event.js';

/* eslint-disable no-console */

/**
 * Ensures the platform has its baseline data on boot:
 *  - a Super Admin account (from env, change password after first login)
 *  - the singleton Settings document
 *  - a few default packages (only if none exist yet)
 */
export async function runSeed() {
  await seedSuperAdmin();
  await Settings.getSingleton();
  await seedDefaultPackages();
  await cleanupLegacyPayments();
  await backfillShortCodes();
}

/**
 * Assigns a unique short code to any existing event that predates the
 * shortCode field, so old events get clean /live/<code> URLs too.
 */
async function backfillShortCodes() {
  const events = await Event.find({
    $or: [{ shortCode: { $exists: false } }, { shortCode: null }, { shortCode: '' }],
  }).select('title brideName groomName shortCode');

  let updated = 0;
  for (const ev of events) {
    // eslint-disable-next-line no-await-in-loop
    ev.shortCode = await Event.generateUniqueShortCode(ev);
    // eslint-disable-next-line no-await-in-loop
    await ev.save();
    updated += 1;
  }
  if (updated) console.log(`[seed] Backfilled short codes for ${updated} event(s).`);
}

/**
 * The original Payment model used a gateway flow with a unique
 * `merchantTransactionId`. The current manual-UPI model drops that field, so
 * the stale unique index (and the throwaway gateway-era docs) must be removed —
 * otherwise multiple new requests would collide on a null `merchantTransactionId`.
 */
async function cleanupLegacyPayments() {
  try {
    await Payment.collection.dropIndex('merchantTransactionId_1');
    console.log('[seed] Dropped legacy Payment index merchantTransactionId_1.');
  } catch {
    // Index doesn't exist (fresh DB or already cleaned) — nothing to do.
  }
  try {
    const { deletedCount } = await Payment.deleteMany({
      merchantTransactionId: { $exists: true },
    });
    if (deletedCount) console.log(`[seed] Removed ${deletedCount} legacy gateway payment(s).`);
  } catch {
    // Best-effort cleanup.
  }
}

async function seedSuperAdmin() {
  const { name, email, password } = env.superAdmin;
  const existing = await User.findOne({ email });

  if (existing) {
    // Make sure the configured account always retains admin access.
    if (existing.role !== 'admin' || !existing.isActive || !existing.approved) {
      existing.role = 'admin';
      existing.isActive = true;
      existing.approved = true;
      await existing.save();
    }
    console.log(`[seed] Super admin present: ${email}`);
    return;
  }

  await User.create({ name, email, password, role: 'admin', isActive: true, approved: true });
  console.log(
    `[seed] Created super admin ${email}. ` +
      (process.env.SUPER_ADMIN_PASSWORD
        ? 'Using SUPER_ADMIN_PASSWORD from env.'
        : 'Default password "MaaEvents9@Admin" — set SUPER_ADMIN_PASSWORD and change it.')
  );
}

async function seedDefaultPackages() {
  const count = await Package.countDocuments();
  if (count > 0) return;

  await Package.create([
    {
      name: 'Silver',
      price: 9999,
      description: 'Essential wedding live streaming for close family & friends.',
      features: ['Single camera HD stream', 'Up to 4 hours', 'Private watch link', 'Live chat'],
      durationLabel: 'Up to 4 hours',
      sortOrder: 1,
    },
    {
      name: 'Gold',
      price: 19999,
      description: 'Our most popular package for a full-day celebration.',
      features: [
        'Multi-camera HD stream',
        'Up to 8 hours',
        'Private watch link',
        'Live chat & guest messages',
        'Photo gallery',
        'Couple & photographer branding',
      ],
      durationLabel: 'Up to 8 hours',
      sortOrder: 2,
    },
    {
      name: 'Platinum',
      price: 34999,
      description: 'The complete premium experience for grand weddings.',
      features: [
        'Multi-camera Full-HD stream',
        'Full-day coverage',
        'Private watch link',
        'Live chat & Q&A',
        'Photo gallery',
        'Full custom branding',
        'Priority support',
      ],
      durationLabel: 'Full day',
      sortOrder: 3,
    },
  ]);
  console.log('[seed] Created default packages (Silver/Gold/Platinum).');
}
