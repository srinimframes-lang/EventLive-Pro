import { User } from '../models/User.js';
import { CreditTransaction } from '../models/CreditTransaction.js';

/**
 * Atomically change a user's unified credit balance and write a ledger entry.
 *
 * Deductions (amount < 0) only succeed when the balance is sufficient, so the
 * wallet can never go negative under concurrency. Returns the updated user, or
 * null when a deduction was blocked by an insufficient balance.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {number} opts.amount   - signed (positive = add, negative = deduct)
 * @param {string} opts.reason   - CREDIT_REASONS value
 * @param {string} [opts.note]
 * @param {string} [opts.createdBy]
 * @param {string} [opts.event]
 */
export async function changeBalance({
  userId,
  amount,
  reason,
  note = '',
  createdBy = null,
  event = null,
}) {
  const filter = { _id: userId };
  if (amount < 0) filter.creditBalance = { $gte: Math.abs(amount) };

  const updated = await User.findOneAndUpdate(
    filter,
    { $inc: { creditBalance: amount } },
    { new: true }
  );

  if (!updated) return null;

  await CreditTransaction.create({
    subAdmin: userId,
    type: 'credit',
    amount,
    reason,
    balanceAfter: updated.creditBalance ?? 0,
    note,
    createdBy,
    event,
  });

  return updated;
}

/**
 * Atomically change a reseller's credit balance and write a ledger entry.
 *
 * For deductions (amount < 0) the update only succeeds when the balance is
 * sufficient, preventing it from going negative under concurrency. Returns the
 * updated user document, or null when a deduction was blocked by low balance.
 *
 * @param {Object} opts
 * @param {string} opts.userId   - reseller _id
 * @param {'youtube'|'server'} opts.type
 * @param {number} opts.amount   - signed (positive = add, negative = remove)
 * @param {string} opts.reason   - CREDIT_REASONS value
 * @param {string} [opts.note]
 * @param {string} [opts.createdBy]
 * @param {string} [opts.event]
 * @param {string} [opts.order]
 */
export async function changeCredits({
  userId,
  type,
  amount,
  reason,
  note = '',
  createdBy = null,
  event = null,
  order = null,
}) {
  const field = `credits.${type}`;
  const filter = { _id: userId };
  // Guard against negative balances on removal/deduction.
  if (amount < 0) filter[field] = { $gte: Math.abs(amount) };

  const updated = await User.findOneAndUpdate(
    filter,
    { $inc: { [field]: amount } },
    { new: true }
  );

  if (!updated) return null; // insufficient balance (or user missing)

  await CreditTransaction.create({
    subAdmin: userId,
    type,
    amount,
    reason,
    balanceAfter: updated.credits?.[type] ?? 0,
    note,
    createdBy,
    event,
    order,
  });

  return updated;
}
