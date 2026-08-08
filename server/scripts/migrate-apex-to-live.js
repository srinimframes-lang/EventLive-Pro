#!/usr/bin/env node
/**
 * Optional one-shot: suspend EventLive mapping on an apex host and ensure live.<apex>.
 * Does NOT delete the Domain row and does NOT change registrar DNS.
 *
 * Usage:
 *   MIGRATE_APEX_CUSTOM_DOMAINS=true node scripts/migrate-apex-to-live.js maaevents9.in
 *
 * Without the env flag the script exits without writing.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { migrateNamedApexIfPresent } from '../src/utils/domainLiveMigrate.js';

const apex = process.argv[2] || 'maaevents9.in';
const enabled = String(process.env.MIGRATE_APEX_CUSTOM_DOMAINS || '').toLowerCase() === 'true';

if (!enabled) {
  console.error(
    'Refusing to run: set MIGRATE_APEX_CUSTOM_DOMAINS=true to suspend EventLive mapping on the apex host.\n' +
      `Example: MIGRATE_APEX_CUSTOM_DOMAINS=true node scripts/migrate-apex-to-live.js ${apex}`
  );
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  const result = await migrateNamedApexIfPresent(apex);
  if (!result) {
    console.log(`No Domain row for ${apex} — nothing to do.`);
  } else if (result.skipped) {
    console.log(result.message);
  } else {
    console.log(result.message);
    console.log('Apex:', result.apexDomain?.host, result.apexDomain?.status);
    console.log('Live:', result.liveDomain?.host, result.liveDomain?.status);
  }
} finally {
  await mongoose.disconnect();
}
