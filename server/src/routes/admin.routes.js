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
import { protect, authorize } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { bannerUpload } from '../middleware/bannerUpload.middleware.js';

const router = Router();

// All admin routes require an authenticated super admin.
router.use(protect, authorize('admin'));

router.get('/analytics', getAnalytics);

router.route('/customers').get(listCustomers).post(createCustomer);
router.route('/customers/:id').patch(updateCustomer).delete(deleteCustomer);
router.post('/customers/:id/credits', adjustCustomerCredits);

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

// Theme builder
router.get('/themes', adminListThemes);
router.post('/themes', createTheme);
router.patch('/themes/:id', updateTheme);
router.delete('/themes/:id', deleteTheme);
router.post('/themes/:id/background', upload.single('background'), uploadThemeBackground);
router.post('/themes/reseed-regional', reseedRegionalThemes);
router.put('/themes/reorder', reorderThemes);
router.post('/themes/:id/duplicate', duplicateTheme);

// Banner advertisements
router.get('/banners', adminListBanners);
router.post('/banners', bannerUpload.single('image'), adminCreateBanner);
router.patch('/banners/:id', adminUpdateBanner);
router.post('/banners/:id/image', bannerUpload.single('image'), adminUploadBannerImage);
router.delete('/banners/:id', adminDeleteBanner);

export default router;
