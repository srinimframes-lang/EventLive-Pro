import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Package } from '../models/Package.js';
import { CreditOrder } from '../models/CreditOrder.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { Payment, PAYMENT_STATUSES } from '../models/Payment.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changeCredits, changeBalance } from '../utils/credits.js';
import {
  assertOwnsRecord,
  createdByFilter,
  isPlatformAdmin,
} from '../utils/tenantScope.js';

const PLATFORM_ROLES = ['admin', 'superadmin'];

function isPlatformUser(user) {
  return PLATFORM_ROLES.includes(user?.role);
}

/** Load a customer-like user owned by this admin (or any if Super Admin). */
async function findScopedCustomer(id, adminUser, res) {
  const customer = await User.findById(id);
  if (!customer || isPlatformUser(customer)) {
    res.status(404);
    throw new Error('Customer not found');
  }
  assertOwnsRecord(customer, adminUser, res, 'customer');
  return customer;
}

async function findScopedSubAdmin(id, adminUser, res) {
  const subAdmin = await User.findOne({ _id: id, role: 'subadmin' });
  if (!subAdmin) {
    res.status(404);
    throw new Error('Sub admin not found');
  }
  assertOwnsRecord(subAdmin, adminUser, res, 'sub admin');
  return subAdmin;
}

/**
 * @route POST /api/admin/customers
 * @desc  Admin creates a customer account (scoped to creating admin)
 * @access Private/Admin
 */
export const createCustomer = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please provide name, email and password');
  }
  if (String(password).length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  const normalized = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalized });
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists');
  }

  const customer = await User.create({
    name,
    email: normalized,
    password,
    phone: phone || '',
    role: 'customer',
    approved: true, // admin-created accounts are pre-approved
    createdBy: req.user._id,
  });

  customer.password = undefined;
  res.status(201).json({ success: true, data: customer });
});

/**
 * @route GET /api/admin/customers
 * @desc  List customer accounts (tenant-scoped)
 * @access Private/Admin
 */
export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await User.find({
    role: { $in: ['customer', 'user', 'organizer'] },
    ...createdByFilter(req.user),
  }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: customers });
});

/**
 * @route PATCH /api/admin/customers/:id
 * @desc  Update a customer (name/phone/active/reset password)
 * @access Private/Admin
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await findScopedCustomer(req.params.id, req.user, res);

  const { name, phone, isActive, approved, password } = req.body;
  if (name !== undefined) customer.name = name;
  if (phone !== undefined) customer.phone = phone;
  if (isActive !== undefined) customer.isActive = isActive;
  if (approved !== undefined) customer.approved = approved;
  if (password) {
    if (String(password).length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters');
    }
    customer.password = password; // re-hashed by pre-save hook
  }
  await customer.save();
  customer.password = undefined;
  res.status(200).json({ success: true, data: customer });
});

/**
 * @route POST /api/admin/customers/:id/credits
 * @desc  Manually add (positive) or remove (negative) credits for a user
 * @body  { amount: number, note?: string }
 * @access Private/Admin
 */
export const adjustCustomerCredits = asyncHandler(async (req, res) => {
  const delta = Number(req.body.amount);
  if (!Number.isFinite(delta) || delta === 0) {
    res.status(400);
    throw new Error('Amount must be a non-zero number');
  }
  const user = await findScopedCustomer(req.params.id, req.user, res);

  const updated = await changeBalance({
    userId: user._id,
    amount: delta,
    reason: delta > 0 ? 'manual_add' : 'manual_remove',
    note: req.body.note || (delta > 0 ? 'Manual credit' : 'Manual debit'),
    createdBy: req.user._id,
  });
  if (!updated) {
    res.status(400);
    throw new Error('Insufficient balance to remove that many credits');
  }

  updated.password = undefined;
  res.status(200).json({ success: true, data: updated });
});

/* ───────────────────────── Credit payment requests ───────────────────────── */

/**
 * @route GET /api/admin/payments?status=pending
 * @desc  List manual UPI credit-purchase requests (tenant-scoped)
 * @access Private/Admin
 */
export const listPayments = asyncHandler(async (req, res) => {
  const filter = { ...createdByFilter(req.user) };
  if (req.query.status && PAYMENT_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const payments = await Payment.find(filter)
    .populate('user', 'name email phone creditBalance')
    .sort({ createdAt: -1 })
    .limit(200);
  res.status(200).json({ success: true, data: payments });
});

/**
 * @route POST /api/admin/payments/:id/approve
 * @desc  Approve a payment request and add the credits to the customer
 * @access Private/Admin
 */
export const approvePayment = asyncHandler(async (req, res) => {
  const existing = await Payment.findById(req.params.id);
  if (!existing || existing.status !== 'pending') {
    res.status(404);
    throw new Error('Pending payment request not found (it may already be reviewed)');
  }
  assertOwnsRecord(existing, req.user, res, 'payment');

  // Atomically flip pending -> approved so credits can only ever be added once.
  const payment = await Payment.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    {
      status: 'approved',
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      reviewNote: req.body.adminNote || '',
    },
    { new: true }
  );
  if (!payment) {
    res.status(404);
    throw new Error('Pending payment request not found (it may already be reviewed)');
  }

  await changeBalance({
    userId: payment.user,
    amount: payment.credits,
    reason: 'purchase',
    note: `UPI payment approved (${payment.credits} credits)`,
    createdBy: req.user._id,
  });

  const populated = await payment.populate('user', 'name email creditBalance');
  res.status(200).json({ success: true, data: populated });
});

/**
 * @route POST /api/admin/payments/:id/reject
 * @access Private/Admin
 */
export const rejectPayment = asyncHandler(async (req, res) => {
  const existing = await Payment.findById(req.params.id);
  if (!existing || existing.status !== 'pending') {
    res.status(404);
    throw new Error('Pending payment request not found (it may already be reviewed)');
  }
  assertOwnsRecord(existing, req.user, res, 'payment');

  const payment = await Payment.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    {
      status: 'rejected',
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      reviewNote: req.body.adminNote || 'Payment could not be verified.',
    },
    { new: true }
  );
  if (!payment) {
    res.status(404);
    throw new Error('Pending payment request not found (it may already be reviewed)');
  }
  const populated = await payment.populate('user', 'name email creditBalance');
  res.status(200).json({ success: true, data: populated });
});

/**
 * @route DELETE /api/admin/payments/:id
 * @desc  Void (delete) a payment request. If it was approved, the credits it
 *        granted are reversed — clamped to the customer's current balance so the
 *        wallet never goes negative (e.g. if some were already spent).
 * @access Private/Admin
 */
export const voidPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) {
    res.status(404);
    throw new Error('Payment request not found');
  }
  assertOwnsRecord(payment, req.user, res, 'payment');

  let reversedCredits = 0;
  if (payment.status === 'approved' && payment.credits > 0) {
    const user = await User.findById(payment.user).select('creditBalance');
    const available = user?.creditBalance ?? 0;
    const toRemove = Math.min(payment.credits, available);
    if (toRemove > 0) {
      await changeBalance({
        userId: payment.user,
        amount: -toRemove,
        reason: 'manual_remove',
        note: `Voided payment of ${payment.credits} credit(s)`,
        createdBy: req.user._id,
      });
      reversedCredits = toRemove;
    }
  }

  await payment.deleteOne();
  res.status(200).json({ success: true, data: { id: req.params.id, reversedCredits } });
});

/**
 * @route DELETE /api/admin/customers/:id
 * @access Private/Admin
 */
export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await findScopedCustomer(req.params.id, req.user, res);
  await customer.deleteOne();
  res.status(200).json({ success: true, id: req.params.id });
});

/**
 * @route GET /api/admin/analytics
 * @desc  High-level metrics for the admin dashboard (tenant-scoped)
 * @access Private/Admin
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const scope = createdByFilter(req.user);
  const customerFilter = {
    role: { $in: ['customer', 'user', 'organizer'] },
    ...scope,
  };
  const subAdminFilter = { role: 'subadmin', ...scope };

  const tenantSubAdminIds = isPlatformAdmin(req.user)
    ? null
    : (await User.find({ role: 'subadmin', ...scope }).select('_id')).map((u) => u._id);

  const creditOrderFilter = tenantSubAdminIds
    ? { subAdmin: { $in: tenantSubAdminIds } }
    : {};

  const [
    customers,
    pendingCustomers,
    subAdmins,
    activeSubAdmins,
    events,
    liveEvents,
    completedEvents,
    packages,
    pendingBookings,
    approvedBookings,
    pendingCreditOrders,
    pendingPayments,
    revenueAgg,
    creditRevenueAgg,
    paymentRevenueAgg,
    creditsAgg,
    creditsSoldAgg,
  ] = await Promise.all([
    User.countDocuments(customerFilter),
    User.countDocuments({ ...customerFilter, approved: false }),
    User.countDocuments(subAdminFilter),
    User.countDocuments({ ...subAdminFilter, isActive: true }),
    Event.countDocuments(scope),
    Event.countDocuments({ ...scope, isLive: true }),
    Event.countDocuments({ ...scope, status: 'ended' }),
    Package.countDocuments({ isActive: true }),
    Booking.countDocuments({ ...scope, status: 'pending' }),
    Booking.countDocuments({ ...scope, status: 'approved' }),
    CreditOrder.countDocuments({ ...creditOrderFilter, status: 'pending' }),
    Payment.countDocuments({ ...scope, status: 'pending' }),
    Booking.aggregate([
      { $match: { status: 'approved', ...scope } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    CreditOrder.aggregate([
      { $match: { status: 'approved', ...creditOrderFilter } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { status: 'approved', ...scope } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    User.aggregate([
      { $match: subAdminFilter },
      {
        $group: {
          _id: null,
          youtube: { $sum: '$credits.youtube' },
          server: { $sum: '$credits.server' },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { status: 'approved', ...scope } },
      { $group: { _id: null, total: { $sum: '$credits' } } },
    ]),
  ]);

  const bookingRevenue = revenueAgg[0]?.total || 0;
  const creditOrderRevenue = creditRevenueAgg[0]?.total || 0;
  const paymentRevenue = paymentRevenueAgg[0]?.total || 0;
  const creditRevenue = creditOrderRevenue + paymentRevenue;
  const creditsSold = creditsSoldAgg[0]?.total || 0;

  res.status(200).json({
    success: true,
    data: {
      customers,
      pendingCustomers,
      subAdmins,
      activeSubAdmins,
      events,
      liveEvents,
      completedEvents,
      packages,
      pendingBookings,
      approvedBookings,
      pendingCreditOrders,
      pendingPayments,
      liveLinks: events,
      creditsSold,
      activeStreams: liveEvents,
      bookingRevenue,
      creditRevenue,
      revenue: bookingRevenue + creditRevenue,
      creditsOutstanding: {
        youtube: creditsAgg[0]?.youtube || 0,
        server: creditsAgg[0]?.server || 0,
      },
    },
  });
});

/* ───────────────────────── Tenant Admins (Super Admin only) ───────────────────────── */

/**
 * @route POST /api/admin/admins
 * @desc  Super Admin creates a tenant Admin account
 * @access Private/SuperAdmin
 */
export const createTenantAdmin = asyncHandler(async (req, res) => {
  if (!isPlatformAdmin(req.user)) {
    res.status(403);
    throw new Error('Only Super Admin can create tenant admins');
  }
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please provide name, email and password');
  }
  if (String(password).length < 8) {
    res.status(400);
    throw new Error('Password must be at least 8 characters');
  }
  const normalized = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalized });
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists');
  }

  const admin = await User.create({
    name,
    email: normalized,
    password,
    phone: phone || '',
    role: 'admin',
    approved: true,
    isActive: true,
    createdBy: req.user._id,
  });
  admin.password = undefined;
  res.status(201).json({ success: true, data: admin });
});

/**
 * @route GET /api/admin/admins
 * @desc  List tenant Admin accounts
 * @access Private/SuperAdmin
 */
export const listTenantAdmins = asyncHandler(async (req, res) => {
  if (!isPlatformAdmin(req.user)) {
    res.status(403);
    throw new Error('Only Super Admin can list tenant admins');
  }
  const admins = await User.find({ role: 'admin' }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: admins });
});

/**
 * @route PATCH /api/admin/admins/:id
 * @access Private/SuperAdmin
 */
export const updateTenantAdmin = asyncHandler(async (req, res) => {
  if (!isPlatformAdmin(req.user)) {
    res.status(403);
    throw new Error('Only Super Admin can update tenant admins');
  }
  const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
  if (!admin) {
    res.status(404);
    throw new Error('Admin not found');
  }
  const { name, phone, isActive, password } = req.body;
  if (name !== undefined) admin.name = name;
  if (phone !== undefined) admin.phone = phone;
  if (isActive !== undefined) admin.isActive = isActive;
  if (password) {
    if (String(password).length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters');
    }
    admin.password = password;
  }
  await admin.save();
  admin.password = undefined;
  res.status(200).json({ success: true, data: admin });
});

/**
 * @route DELETE /api/admin/admins/:id
 * @access Private/SuperAdmin
 */
export const deleteTenantAdmin = asyncHandler(async (req, res) => {
  if (!isPlatformAdmin(req.user)) {
    res.status(403);
    throw new Error('Only Super Admin can delete tenant admins');
  }
  const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
  if (!admin) {
    res.status(404);
    throw new Error('Admin not found');
  }
  await admin.deleteOne();
  res.status(200).json({ success: true, id: req.params.id });
});

/* ───────────────────────── Sub Admins (resellers) ───────────────────────── */

/**
 * @route POST /api/admin/subadmins
 * @desc  Create a reseller (sub admin) account with optional starting credits
 * @access Private/Admin
 */
export const createSubAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, phone, youtubeCredits, serverCredits } = req.body;
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please provide name, email and password');
  }
  if (String(password).length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  const normalized = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalized });
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists');
  }

  const subAdmin = await User.create({
    name,
    email: normalized,
    password,
    phone: phone || '',
    role: 'subadmin',
    approved: true,
    isActive: true,
    createdBy: req.user._id,
    credits: {
      youtube: Math.max(0, Number(youtubeCredits) || 0),
      server: Math.max(0, Number(serverCredits) || 0),
    },
  });

  // Record any starting credits in the ledger for auditability.
  if (subAdmin.credits.youtube > 0) {
    await CreditTransaction.create({
      subAdmin: subAdmin._id,
      type: 'youtube',
      amount: subAdmin.credits.youtube,
      reason: 'manual_add',
      balanceAfter: subAdmin.credits.youtube,
      note: 'Starting balance',
      createdBy: req.user._id,
    });
  }
  if (subAdmin.credits.server > 0) {
    await CreditTransaction.create({
      subAdmin: subAdmin._id,
      type: 'server',
      amount: subAdmin.credits.server,
      reason: 'manual_add',
      balanceAfter: subAdmin.credits.server,
      note: 'Starting balance',
      createdBy: req.user._id,
    });
  }

  subAdmin.password = undefined;
  res.status(201).json({ success: true, data: subAdmin });
});

/**
 * @route GET /api/admin/subadmins
 * @access Private/Admin
 */
export const listSubAdmins = asyncHandler(async (req, res) => {
  const subAdmins = await User.find({
    role: 'subadmin',
    ...createdByFilter(req.user),
  }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: subAdmins });
});

/**
 * @route PATCH /api/admin/subadmins/:id
 * @desc  Update a reseller (name/phone/enable-disable/reset password)
 * @access Private/Admin
 */
export const updateSubAdmin = asyncHandler(async (req, res) => {
  const subAdmin = await findScopedSubAdmin(req.params.id, req.user, res);
  const { name, phone, isActive, password } = req.body;
  if (name !== undefined) subAdmin.name = name;
  if (phone !== undefined) subAdmin.phone = phone;
  if (isActive !== undefined) subAdmin.isActive = isActive;
  if (password) {
    if (String(password).length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters');
    }
    subAdmin.password = password;
  }
  await subAdmin.save();
  subAdmin.password = undefined;
  res.status(200).json({ success: true, data: subAdmin });
});

/**
 * @route DELETE /api/admin/subadmins/:id
 * @access Private/Admin
 */
export const deleteSubAdmin = asyncHandler(async (req, res) => {
  const subAdmin = await findScopedSubAdmin(req.params.id, req.user, res);
  await subAdmin.deleteOne();
  res.status(200).json({ success: true, id: req.params.id });
});

/**
 * @route POST /api/admin/subadmins/:id/credits
 * @desc  Add (positive) or remove (negative) credits for a reseller
 * @body  { type: 'youtube'|'server', amount: number, note?: string }
 * @access Private/Admin
 */
export const adjustSubAdminCredits = asyncHandler(async (req, res) => {
  const { type, amount, note } = req.body;
  if (!['youtube', 'server'].includes(type)) {
    res.status(400);
    throw new Error('Credit type must be "youtube" or "server"');
  }
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta === 0) {
    res.status(400);
    throw new Error('Amount must be a non-zero number');
  }

  const subAdmin = await findScopedSubAdmin(req.params.id, req.user, res);

  const updated = await changeCredits({
    userId: subAdmin._id,
    type,
    amount: delta,
    reason: delta > 0 ? 'manual_add' : 'manual_remove',
    note: note || (delta > 0 ? 'Manual credit' : 'Manual debit'),
    createdBy: req.user._id,
  });

  if (!updated) {
    res.status(400);
    throw new Error('Insufficient balance to remove that many credits');
  }

  updated.password = undefined;
  res.status(200).json({ success: true, data: updated });
});

/* ───────────────────────── Credit Orders ───────────────────────── */

async function creditOrderScopeFilter(adminUser) {
  if (isPlatformAdmin(adminUser)) return {};
  const ids = (await User.find({ role: 'subadmin', createdBy: adminUser._id }).select('_id')).map(
    (u) => u._id
  );
  return { subAdmin: { $in: ids } };
}

async function assertOwnsCreditOrder(order, adminUser, res) {
  if (isPlatformAdmin(adminUser)) return;
  const sub = await User.findById(order.subAdmin).select('createdBy');
  if (!sub || sub.createdBy?.toString() !== adminUser._id.toString()) {
    res.status(403);
    throw new Error('You do not have permission to access this order');
  }
}

/**
 * @route GET /api/admin/credit-orders
 * @access Private/Admin
 */
export const listCreditOrders = asyncHandler(async (req, res) => {
  const filter = { ...(await creditOrderScopeFilter(req.user)) };
  if (req.query.status) filter.status = req.query.status;
  const orders = await CreditOrder.find(filter)
    .populate('subAdmin', 'name email phone')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: orders });
});

/**
 * @route POST /api/admin/credit-orders/:id/approve
 * @desc  Approve a top-up order and grant the credits
 * @access Private/Admin
 */
export const approveCreditOrder = asyncHandler(async (req, res) => {
  const order = await CreditOrder.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  await assertOwnsCreditOrder(order, req.user, res);
  if (order.status === 'approved') {
    return res.status(200).json({ success: true, data: order });
  }

  await changeCredits({
    userId: order.subAdmin,
    type: order.type,
    amount: order.quantity,
    reason: 'purchase',
    note: `Order ${order._id} approved`,
    createdBy: req.user._id,
    order: order._id,
  });

  order.status = 'approved';
  order.reviewedBy = req.user._id;
  order.reviewedAt = new Date();
  if (req.body.adminNote !== undefined) order.adminNote = req.body.adminNote;
  await order.save();

  return res.status(200).json({ success: true, data: order });
});

/**
 * @route POST /api/admin/credit-orders/:id/reject
 * @access Private/Admin
 */
export const rejectCreditOrder = asyncHandler(async (req, res) => {
  const order = await CreditOrder.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  await assertOwnsCreditOrder(order, req.user, res);
  order.status = 'rejected';
  order.adminNote = req.body.adminNote || 'Payment could not be verified.';
  order.reviewedBy = req.user._id;
  order.reviewedAt = new Date();
  await order.save();
  res.status(200).json({ success: true, data: order });
});
