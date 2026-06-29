import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Package } from '../models/Package.js';
import { CreditOrder } from '../models/CreditOrder.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changeCredits } from '../utils/credits.js';

/**
 * @route POST /api/admin/customers
 * @desc  Super Admin creates a customer account
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
 * @desc  List all customer accounts
 * @access Private/Admin
 */
export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await User.find({
    role: { $in: ['customer', 'user', 'organizer'] },
  }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: customers });
});

/**
 * @route PATCH /api/admin/customers/:id
 * @desc  Update a customer (name/phone/active/reset password)
 * @access Private/Admin
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.id);
  if (!customer || customer.role === 'admin') {
    res.status(404);
    throw new Error('Customer not found');
  }

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
 * @route DELETE /api/admin/customers/:id
 * @access Private/Admin
 */
export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.id);
  if (!customer || customer.role === 'admin') {
    res.status(404);
    throw new Error('Customer not found');
  }
  await customer.deleteOne();
  res.status(200).json({ success: true, id: req.params.id });
});

/**
 * @route GET /api/admin/analytics
 * @desc  High-level platform metrics for the admin dashboard
 * @access Private/Admin
 */
export const getAnalytics = asyncHandler(async (_req, res) => {
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
    revenueAgg,
    creditRevenueAgg,
    creditsAgg,
  ] = await Promise.all([
    User.countDocuments({ role: { $in: ['customer', 'user', 'organizer'] } }),
    User.countDocuments({ role: { $in: ['customer', 'user', 'organizer'] }, approved: false }),
    User.countDocuments({ role: 'subadmin' }),
    User.countDocuments({ role: 'subadmin', isActive: true }),
    Event.countDocuments(),
    Event.countDocuments({ isLive: true }),
    Event.countDocuments({ status: 'ended' }),
    Package.countDocuments({ isActive: true }),
    Booking.countDocuments({ status: 'pending' }),
    Booking.countDocuments({ status: 'approved' }),
    CreditOrder.countDocuments({ status: 'pending' }),
    Booking.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    CreditOrder.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    User.aggregate([
      { $match: { role: 'subadmin' } },
      {
        $group: {
          _id: null,
          youtube: { $sum: '$credits.youtube' },
          server: { $sum: '$credits.server' },
        },
      },
    ]),
  ]);

  const bookingRevenue = revenueAgg[0]?.total || 0;
  const creditRevenue = creditRevenueAgg[0]?.total || 0;

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
export const listSubAdmins = asyncHandler(async (_req, res) => {
  const subAdmins = await User.find({ role: 'subadmin' }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: subAdmins });
});

/**
 * @route PATCH /api/admin/subadmins/:id
 * @desc  Update a reseller (name/phone/enable-disable/reset password)
 * @access Private/Admin
 */
export const updateSubAdmin = asyncHandler(async (req, res) => {
  const subAdmin = await User.findOne({ _id: req.params.id, role: 'subadmin' });
  if (!subAdmin) {
    res.status(404);
    throw new Error('Sub admin not found');
  }
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
  const subAdmin = await User.findOne({ _id: req.params.id, role: 'subadmin' });
  if (!subAdmin) {
    res.status(404);
    throw new Error('Sub admin not found');
  }
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

  const subAdmin = await User.findOne({ _id: req.params.id, role: 'subadmin' });
  if (!subAdmin) {
    res.status(404);
    throw new Error('Sub admin not found');
  }

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

/**
 * @route GET /api/admin/credit-orders
 * @access Private/Admin
 */
export const listCreditOrders = asyncHandler(async (req, res) => {
  const filter = {};
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
  order.status = 'rejected';
  order.adminNote = req.body.adminNote || 'Payment could not be verified.';
  order.reviewedBy = req.user._id;
  order.reviewedAt = new Date();
  await order.save();
  res.status(200).json({ success: true, data: order });
});
