import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { Settings } from '../models/Settings.js';
import { CreditOrder } from '../models/CreditOrder.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function getPricing(settings) {
  return {
    youtube: settings?.creditPricing?.youtube ?? 100,
    server: settings?.creditPricing?.server ?? 500,
  };
}

/**
 * @route GET /api/reseller/me
 * @desc  Reseller's own balance, credit pricing and recent ledger entries
 * @access Private/SubAdmin
 */
export const getResellerMe = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  const transactions = await CreditTransaction.find({ subAdmin: req.user._id })
    .sort({ createdAt: -1 })
    .limit(15);

  res.status(200).json({
    success: true,
    data: {
      credits: req.user.credits || { youtube: 0, server: 0 },
      pricing: getPricing(settings),
      transactions,
    },
  });
});

/**
 * @route GET /api/reseller/transactions
 * @access Private/SubAdmin
 */
export const listMyTransactions = asyncHandler(async (req, res) => {
  const transactions = await CreditTransaction.find({ subAdmin: req.user._id })
    .populate('event', 'title slug')
    .sort({ createdAt: -1 })
    .limit(100);
  res.status(200).json({ success: true, data: transactions });
});

/**
 * @route POST /api/reseller/credit-orders
 * @desc  Reseller requests a credit top-up (manual payment verification)
 * @access Private/SubAdmin
 */
export const createCreditOrder = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  const pricing = getPricing(settings);

  const type = req.body.type === 'server' ? 'server' : 'youtube';
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 0);
  if (!quantity) {
    res.status(400);
    throw new Error('Please enter how many credits you want to buy');
  }

  const unitPrice = pricing[type];
  const amount = unitPrice * quantity;

  const order = await CreditOrder.create({
    subAdmin: req.user._id,
    type,
    quantity,
    unitPrice,
    amount,
    paymentMethod: req.body.paymentMethod || '',
    paymentReference: req.body.paymentReference || '',
    channel: 'manual',
    status: 'pending',
  });

  res.status(201).json({ success: true, data: order });
});

/**
 * @route GET /api/reseller/credit-orders
 * @access Private/SubAdmin
 */
export const listMyCreditOrders = asyncHandler(async (req, res) => {
  const orders = await CreditOrder.find({ subAdmin: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: orders });
});

/**
 * @route GET /api/reseller/events
 * @desc  Events created by this reseller
 * @access Private/SubAdmin
 */
export const listMyEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ organizer: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: events });
});
