import { execSync } from 'child_process';
import fs from 'fs';

const enc = 'utf8';

let svc = execSync('git show HEAD:client/src/services/admin.service.js', { encoding: enc });
if (!svc.includes('return data.data;\n  },\n  async verifyDomain')) {
  console.error('createDomain anchor not found in HEAD admin.service.js');
  process.exit(1);
}
svc = svc.replace(
  'return data.data;\n  },\n  async verifyDomain',
  'return { ...(data.data || {}), meta: data.meta };\n  },\n  async verifyDomain',
);
if (!svc.includes('async suspendDomain(id)')) {
  console.error('suspendDomain not found');
  process.exit(1);
}
svc = svc.replace(
  `async suspendDomain(id) {
    const { data } = await api.post(\`/api/admin/domains/\${id}/suspend\`);
    return data.data;
  },
  async refreshDomain(id) {`,
  `async suspendDomain(id) {
    const { data } = await api.post(\`/api/admin/domains/\${id}/suspend\`);
    return data.data;
  },
  /** Suspend apex EventLive mapping and ensure live.<apex> exists (no delete). */
  async migrateDomainToLive(id) {
    const { data } = await api.post(\`/api/admin/domains/\${id}/migrate-to-live\`);
    return { ...(data.data || {}), message: data.message };
  },
  async refreshDomain(id) {`,
);
fs.writeFileSync('client/src/services/admin.service.js', svc, enc);

let routes = execSync('git show HEAD:server/src/routes/admin.routes.js', { encoding: enc });
routes = routes.replace(
  `  uploadCustomerBrandingLogo,
} from '../controllers/adminDomain.controller.js';`,
  `  uploadCustomerBrandingLogo,
  migrateDomainToLive,
} from '../controllers/adminDomain.controller.js';`,
);
routes = routes.replace(
  `router.post('/domains/:id/suspend', suspendDomain);
router.post('/domains/:id/refresh', refreshDomainStatus);`,
  `router.post('/domains/:id/suspend', suspendDomain);
router.post('/domains/:id/migrate-to-live', migrateDomainToLive);
router.post('/domains/:id/refresh', refreshDomainStatus);`,
);
fs.writeFileSync('server/src/routes/admin.routes.js', routes, enc);

const ok =
  svc.includes('migrateDomainToLive') &&
  svc.includes('meta: data.meta') &&
  !svc.includes('getR2StorageStatus') &&
  routes.includes('migrate-to-live') &&
  !routes.includes('storage/r2') &&
  !routes.includes('alert.controller');
console.log(
  JSON.stringify({
    ok,
    svcLines: svc.split(/\n/).length,
    routesLines: routes.split(/\n/).length,
    migrateSvc: svc.includes('migrateDomainToLive'),
    migrateRoutes: routes.includes('migrate-to-live'),
    noR2: !svc.includes('getR2StorageStatus') && !routes.includes('storage/r2'),
    noAlerts: !routes.includes('alert.controller'),
  }),
);
if (!ok) process.exit(1);
