import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Package } from '../models/Package.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
  const customers = await User.find({ role: { $ne: 'admin' } }).sort({ createdAt: -1 });
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
    events,
    liveEvents,
    completedEvents,
    packages,
    pendingBookings,
    approvedBookings,
    revenueAgg,
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    User.countDocuments({ role: { $ne: 'admin' }, approved: false }),
    Event.countDocuments(),
    Event.countDocuments({ isLive: true }),
    Event.countDocuments({ status: 'ended' }),
    Package.countDocuments({ isActive: true }),
    Booking.countDocuments({ status: 'pending' }),
    Booking.countDocuments({ status: 'approved' }),
    Booking.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      customers,
      pendingCustomers,
      events,
      liveEvents,
      completedEvents,
      packages,
      pendingBookings,
      approvedBookings,
      revenue: revenueAgg[0]?.total || 0,
    },
  });
});
