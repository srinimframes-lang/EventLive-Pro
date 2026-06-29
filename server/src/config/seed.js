import { env } from './env.js';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
import { Package } from '../models/Package.js';

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
}

async function seedSuperAdmin() {
  const { name, email, password } = env.superAdmin;
  const existing = await User.findOne({ email });

  if (existing) {
    // Make sure the configured account always retains admin access.
    if (existing.role !== 'admin' || !existing.isActive) {
      existing.role = 'admin';
      existing.isActive = true;
      await existing.save();
    }
    console.log(`[seed] Super admin present: ${email}`);
    return;
  }

  await User.create({ name, email, password, role: 'admin', isActive: true });
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
