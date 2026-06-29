/**
 * Credit system configuration (single wallet model).
 *
 * - 1 credit costs ₹100.
 * - Creating a YouTube live link costs 1 credit (₹100).
 * - Creating a Server live link costs 5 credits (₹500).
 *
 * Customers buy credits via the PhonePe gateway; credits are added on a
 * successful payment and deducted automatically when a link is created.
 */

// ₹ price of a single credit.
export const CREDIT_UNIT_PRICE = 100;

// How many credits each kind of live link consumes.
export const LINK_COSTS = {
  youtube: 1,
  server: 5,
};

// Purchasable products shown to the customer. Each grants `credits` credits.
export const CREDIT_PRODUCTS = [
  {
    id: 'youtube',
    name: 'YouTube Live Link',
    credits: 1,
    price: 100,
    description: 'Enough credits to create one YouTube live link.',
  },
  {
    id: 'server',
    name: 'Server Live Link',
    credits: 5,
    price: 500,
    description: 'Enough credits to create one private server live link.',
  },
];

export function getProductById(id) {
  return CREDIT_PRODUCTS.find((p) => p.id === id) || null;
}

export function linkCost(linkType) {
  return LINK_COSTS[linkType] ?? LINK_COSTS.youtube;
}
