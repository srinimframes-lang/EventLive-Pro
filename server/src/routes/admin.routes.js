import { Router } from 'express';
import {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  adjustCustomerCredits,
  listPayments,
  approvePayment,
  rejectPayment,
  voidPayment,
  getAnalytics,
  createTenantAdmin,
  listTenantAdmins,
  updateTenantAdmin,
  deleteTenantAdmin,
  createSubAdmin,
  listSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
  adjustSubAdminCredits,
  listCreditOrders,
  approveCreditOrder,
  rejectCreditOrder,
} from '../controllers/admin.controller.js';
import {
  listDomains,
  createDomain,
  verifyDomain,
  approveDomain,
  suspendDomain,
  removeDomain,
  refreshDomainStatus,
  getIntegrationStatus,
  updateCustomerBranding,
  uploadCustomerBrandingLogo,
} from '../controllers/adminDomain.controller.js';
import {
  adminListThemes,
  createTheme,
  updateTheme,
  deleteTheme,
  uploadThemeBackground,
  duplicateTheme,
  reseedRegionalThemes,
  reorderThemes,
} from '../controllers/theme.controller.js';
import {
  adminListBanners,
  adminCreateBanner,
  adminUpdateBanner,
  adminUploadBannerImage,
  adminDeleteBanner,
} from '../controllers/banner.controller.js';
import {
  getSystemHealth,
  getSystemHealthLogs,
  postSystemHealthTest,
  postSystemHealthRestart,
  postSystemHealthAck,
} from '../controllers/systemHealth.controller.js';
import {
  getBackupStatus,
  getBackups,
  getBackupLogs,
  postRunBackup,
  downloadBackup,
  postRestoreBackup,
  deleteBackup,
} from '../controllers/backup.controller.js';
import { protect, authorize, authorizePlatformAdmin } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { bannerUpload } from '../middleware/bannerUpload.middleware.js';

const router = Router();

// Tenant Admin + Super Admin / legacy platform admin may access the admin API.
router.use(protect, authorize('admin', 'superadmin'));

router.get('/analytics', getAnalytics);

router.route('/customers').get(listCustomers).post(createCustomer);
router.route('/customers/:id').patch(updateCustomer).delete(deleteCustomer);
router.post('/customers/:id/credits', adjustCustomerCredits);

// Tenant admins (platform admin only — handlers also enforce)
router.route('/admins').get(authorizePlatformAdmin, listTenantAdmins).post(authorizePlatformAdmin, createTenantAdmin);
router
  .route('/admins/:id')
  .patch(authorizePlatformAdmin, updateTenantAdmin)
  .delete(authorizePlatformAdmin, deleteTenantAdmin);

// Credit payment requests (manual UPI)
router.get('/payments', listPayments);
router.post('/payments/:id/approve', approvePayment);
router.post('/payments/:id/reject', rejectPayment);
router.delete('/payments/:id', voidPayment);

// Resellers (sub admins)
router.route('/subadmins').get(listSubAdmins).post(createSubAdmin);
router.route('/subadmins/:id').patch(updateSubAdmin).delete(deleteSubAdmin);
router.post('/subadmins/:id/credits', adjustSubAdminCredits);

// Credit top-up orders
router.get('/credit-orders', listCreditOrders);
router.post('/credit-orders/:id/approve', approveCreditOrder);
router.post('/credit-orders/:id/reject', rejectCreditOrder);

// White-label: per-customer branding
router.patch('/customers/:id/branding', updateCustomerBranding);
router.post('/customers/:id/branding/logo', upload.single('logo'), uploadCustomerBrandingLogo);

// White-label: custom domains
router.get('/domains/integration', getIntegrationStatus);
router.route('/domains').get(listDomains).post(createDomain);
router.post('/domains/:id/verify', verifyDomain);
router.post('/domains/:id/approve', approveDomain);
router.post('/domains/:id/suspend', suspendDomain);
router.post('/domains/:id/refresh', refreshDomainStatus);
router.delete('/domains/:id', removeDomain);

// Theme builder (platform-wide)
router.get('/themes', authorizePlatformAdmin, adminListThemes);
router.post('/themes', authorizePlatformAdmin, createTheme);
router.patch('/themes/:id', authorizePlatformAdmin, updateTheme);
router.delete('/themes/:id', authorizePlatformAdmin, deleteTheme);
router.post(
  '/themes/:id/background',
  authorizePlatformAdmin,
  upload.single('background'),
  uploadThemeBackground
);
router.post('/themes/reseed-regional', authorizePlatformAdmin, reseedRegionalThemes);
router.put('/themes/reorder', authorizePlatformAdmin, reorderThemes);
router.post('/themes/:id/duplicate', authorizePlatformAdmin, duplicateTheme);

// Banner advertisements (platform-wide)
router.get('/banners', authorizePlatformAdmin, adminListBanners);
router.post('/banners', authorizePlatformAdmin, bannerUpload.single('image'), adminCreateBanner);
router.patch('/banners/:id', authorizePlatformAdmin, adminUpdateBanner);
router.post(
  '/banners/:id/image',
  authorizePlatformAdmin,
  bannerUpload.single('image'),
  adminUploadBannerImage
);
router.delete('/banners/:id', authorizePlatformAdmin, adminDeleteBanner);

// System Health (platform Super Admin only — diagnostics / safe restarts)
router.get('/system-health', authorizePlatformAdmin, getSystemHealth);
router.get('/system-health/logs', authorizePlatformAdmin, getSystemHealthLogs);
router.post('/system-health/test', authorizePlatformAdmin, postSystemHealthTest);
router.post('/system-health/restart', authorizePlatformAdmin, postSystemHealthRestart);
router.post('/system-health/ack', authorizePlatformAdmin, postSystemHealthAck);

// Backup Manager (platform Super Admin — MongoDB + recordings archives)
router.get('/backups/status', authorizePlatformAdmin, getBackupStatus);
router.get('/backups/logs', authorizePlatformAdmin, getBackupLogs);
router.get('/backups', authorizePlatformAdmin, getBackups);
router.post('/backups/run', authorizePlatformAdmin, postRunBackup);
router.get('/backups/:id/download', authorizePlatformAdmin, downloadBackup);
router.post('/backups/:id/restore', authorizePlatformAdmin, postRestoreBackup);
router.delete('/backups/:id', authorizePlatformAdmin, deleteBackup);

export default router;
