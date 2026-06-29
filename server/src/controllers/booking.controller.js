import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';
import { Package } from '../models/Package.js';
import { Event } from '../models/Event.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { persistUpload } from '../utils/storage.js';

/**
 * @route POST /api/bookings
 * @desc  Customer submits a booking request with payment proof (status=pending)
 * @access Private (customer)
 */
export const createBooking = asyncHandler(async (req, res) => {
  // Self-registered customers must be approved by the admin before booking.
  if (req.user.role !== 'admin' && req.user.approved === false) {
    res.status(403);
    throw new Error('Your account is pending admin approval. Please wait before booking.');
  }

  const b = req.body || {};

  let pkg = null;
  if (b.package && mongoose.isValidObjectId(b.package)) {
    pkg = await Package.findById(b.package);
  }
  if (!pkg) {
    res.status(400);
    throw new Error('Please select a valid package');
  }

  let paymentScreenshot = '';
  if (req.file) paymentScreenshot = await persistUpload(req.file);

  const booking = await Booking.create({
    customer: req.user._id,
    package: pkg._id,
    packageName: pkg.name,
    amount: pkg.price,
    eventTitle: b.eventTitle || '',
    brideName: b.brideName || '',
    groomName: b.groomName || '',
    eventDate: b.eventDate || undefined,
    venue: b.venue || '',
    notes: b.notes || '',
    paymentMethod: b.paymentMethod || '',
    paymentReference: b.paymentReference || '',
    paymentScreenshot,
    status: 'pending',
  });

  res.status(201).json({ success: true, data: booking });
});

/**
 * @route GET /api/bookings/mine
 * @desc  Customer lists their own bookings
 * @access Private (customer)
 */
export const listMyBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ customer: req.user._id })
    .populate('package', 'name price')
    .populate('event', 'title slug status')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: bookings });
});

/**
 * @route GET /api/bookings  (admin)
 * @desc  Admin lists all bookings, optionally filtered by status
 * @access Private/Admin
 */
export const listAllBookings = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const bookings = await Booking.find(filter)
    .populate('customer', 'name email phone')
    .populate('package', 'name price')
    .populate('event', 'title slug status')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: bookings });
});

/**
 * @route GET /api/bookings/:id
 * @desc  Get one booking (owner or admin)
 * @access Private
 */
export const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('customer', 'name email phone')
    .populate('package', 'name price')
    .populate('event', 'title slug status');
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  const isOwner = booking.customer._id.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('You do not have permission to view this booking');
  }
  res.status(200).json({ success: true, data: booking });
});

/**
 * @route POST /api/bookings/:id/approve  (admin)
 * @desc  Approve a booking's payment and create the live event from it
 * @access Private/Admin
 */
export const approveBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  if (booking.status === 'approved' && booking.event) {
    const existing = await Event.findById(booking.event).populate('organizer', 'name email');
    return res.status(200).json({ success: true, data: { booking, event: existing } });
  }

  const start = booking.eventDate ? new Date(booking.eventDate) : new Date(Date.now() + 86400000);
  const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  const couple =
    booking.brideName && booking.groomName
      ? `${booking.brideName} & ${booking.groomName}`
      : booking.brideName || booking.groomName || '';
  const title = booking.eventTitle || (couple ? `${couple} Wedding` : 'Wedding Live Stream');

  const event = await Event.create({
    title,
    description:
      booking.notes ||
      `Live wedding stream${couple ? ` for ${couple}` : ''} by MaaEvents9 Broadcasting Services.`,
    organizer: booking.customer,
    booking: booking._id,
    package: booking.package,
    category: 'other',
    status: 'published',
    startTime: start,
    endTime: end,
    isOnline: true,
    venue: booking.venue || '',
    brideName: booking.brideName || '',
    groomName: booking.groomName || '',
  });

  booking.status = 'approved';
  booking.event = event._id;
  booking.reviewedBy = req.user._id;
  booking.reviewedAt = new Date();
  if (req.body.adminNote !== undefined) booking.adminNote = req.body.adminNote;
  await booking.save();

  const populated = await event.populate('organizer', 'name email');
  return res.status(200).json({ success: true, data: { booking, event: populated } });
});

/**
 * @route POST /api/bookings/:id/reject  (admin)
 * @access Private/Admin
 */
export const rejectBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  booking.status = 'rejected';
  booking.adminNote = req.body.adminNote || 'Payment could not be verified.';
  booking.reviewedBy = req.user._id;
  booking.reviewedAt = new Date();
  await booking.save();
  res.status(200).json({ success: true, data: booking });
});
