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

// Purchasable credit packs shown to the customer. Each grants `credits` credits
// (1 credit = ₹100). Credits are spent on live links: YouTube = 1, Server = 5.
export const CREDIT_PRODUCTS = [
  {
    id: 'credits-1',
    name: '1 credit',
    credits: 1,
    price: 100,
    description: 'Create one YouTube live link.',
  },
  {
    id: 'credits-5',
    name: '5 credits',
    credits: 5,
    price: 500,
    description: 'One Server live link, or five YouTube links.',
  },
  {
    id: 'credits-10',
    name: '10 credits',
    credits: 10,
    price: 1000,
    description: 'Best value — stream more for less.',
  },
];

export function getProductById(id) {
  return CREDIT_PRODUCTS.find((p) => p.id === id) || null;
}

export function linkCost(linkType) {
  return LINK_COSTS[linkType] ?? LINK_COSTS.youtube;
}
