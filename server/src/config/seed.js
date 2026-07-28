import { env } from './env.js';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
import { Package } from '../models/Package.js';
import { Payment } from '../models/Payment.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';

/* eslint-disable no-console */

/**
 * Ensures the platform has its baseline data on boot:
 *  - a Super Admin account (created only if missing — never mutates existing users)
 *  - the singleton Settings document
 *  - a few default packages (only if none exist yet)
 *
 * Destructive / multi-tenant migrations are OFF by default. Enable only with
 * MIGRATE_MULTI_TENANT=true (idempotent, optional).
 */
import { seedCuratedThemes } from './seedCuratedThemes.js';

export async function runSeed() {
  await seedSuperAdmin();
  await Settings.getSingleton();
  await seedDefaultPackages();
  await seedCuratedThemes();
  await backfillShortCodes();

  if (env.migrateMultiTenant) {
    await runOptionalMultiTenantMigration();
  } else {
    console.log(
      '[seed] Multi-tenant migration skipped (set MIGRATE_MULTI_TENANT=true to run explicitly).'
    );
  }
}

/**
 * Assigns a unique short code to any existing event that predates the
 * shortCode field, so old events get clean /<code> URLs too.
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
 * Optional, idempotent multi-tenant migration.
 * Only runs when MIGRATE_MULTI_TENANT=true.
 * - Promotes legacy platform admins (role=admin, no createdBy) → superadmin
 * - Backfills createdBy on events / bookings / payments where missing
 * Never deletes documents.
 */
async function runOptionalMultiTenantMigration() {
  console.log('[seed] MIGRATE_MULTI_TENANT=true — running optional multi-tenant migration…');

  const promoted = await User.updateMany(
    {
      role: 'admin',
      $or: [{ createdBy: null }, { createdBy: { $exists: false } }],
    },
    { $set: { role: 'superadmin' } }
  );
  if (promoted.modifiedCount) {
    console.log(`[seed] Promoted ${promoted.modifiedCount} legacy admin(s) → superadmin.`);
  } else {
    console.log('[seed] No legacy admins to promote (idempotent).');
  }

  // Ensure configured bootstrap email is superadmin when migration is explicitly enabled.
  const { email } = env.superAdmin;
  const configured = await User.findOne({ email });
  if (configured && configured.role !== 'superadmin') {
    configured.role = 'superadmin';
    configured.isActive = true;
    configured.approved = true;
    await configured.save();
    console.log(`[seed] Ensured configured account is superadmin: ${email}`);
  }

  await backfillTenantOwnership();
  console.log('[seed] Multi-tenant migration finished.');
}

/**
 * Backfill createdBy on events/bookings/payments (add-only, never deletes).
 * createdBy is always the owning admin id (never the customer).
 */
async function backfillTenantOwnership() {
  const missing = { $or: [{ createdBy: null }, { createdBy: { $exists: false } }] };

  const events = await Event.find(missing).select('organizer');
  let eventN = 0;
  for (const ev of events) {
    // eslint-disable-next-line no-await-in-loop
    const org = await User.findById(ev.organizer).select('role createdBy');
    if (!org) continue;
    if (org.role === 'admin' || org.role === 'superadmin') {
      ev.createdBy = org._id;
    } else if (org.createdBy) {
      ev.createdBy = org.createdBy;
    }
    if (ev.createdBy) {
      // eslint-disable-next-line no-await-in-loop
      await ev.save();
      eventN += 1;
    }
  }
  if (eventN) console.log(`[seed] Backfilled createdBy on ${eventN} event(s).`);

  const bookings = await Booking.find(missing).select('customer');
  let bookingN = 0;
  for (const b of bookings) {
    // eslint-disable-next-line no-await-in-loop
    const cust = await User.findById(b.customer).select('createdBy');
    if (cust?.createdBy) {
      b.createdBy = cust.createdBy;
      // eslint-disable-next-line no-await-in-loop
      await b.save();
      bookingN += 1;
    }
  }
  if (bookingN) console.log(`[seed] Backfilled createdBy on ${bookingN} booking(s).`);

  const payments = await Payment.find(missing).select('user');
  let payN = 0;
  for (const p of payments) {
    // eslint-disable-next-line no-await-in-loop
    const u = await User.findById(p.user).select('createdBy');
    if (u?.createdBy) {
      p.createdBy = u.createdBy;
      // eslint-disable-next-line no-await-in-loop
      await p.save();
      payN += 1;
    }
  }
  if (payN) console.log(`[seed] Backfilled createdBy on ${payN} payment(s).`);
}

/**
 * Creates the bootstrap Super Admin only when the email does not exist.
 * Never updates / rewrites an existing user (production-safe).
 */
async function seedSuperAdmin() {
  const { name, email, password } = env.superAdmin;
  const existing = await User.findOne({ email });

  if (existing) {
    console.log(`[seed] Super admin present (unchanged): ${email} role=${existing.role}`);
    return;
  }

  // Fresh installs get superadmin. Existing production accounts are never rewritten.
  await User.create({
    name,
    email,
    password,
    role: 'superadmin',
    isActive: true,
    approved: true,
  });
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
