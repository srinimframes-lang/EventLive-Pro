import api from './api.js';

export const paymentService = {
  /** Product catalogue, pricing, UPI/Razorpay details and (if logged in) balance. */
  async products() {
    const { data } = await api.get('/api/payments/products');
    return data.data;
  },
  /** Submit a manual UPI payment request (pending admin approval). */
  async request(productId, reference) {
    const { data } = await api.post('/api/payments/request', { productId, reference });
    return data.data;
  },
  /** Create a Razorpay order (server sets amount/credits from productId). */
  async createRazorpayOrder(productId) {
    const { data } = await api.post('/api/payments/razorpay/create-order', { productId });
    return data.data;
  },
  /** Verify Checkout signature; grants credits once. */
  async verifyRazorpay(payload) {
    const { data } = await api.post('/api/payments/razorpay/verify', payload);
    return data.data;
  },
  /** Cancel a pending Razorpay checkout (no credits). */
  async cancelRazorpay(payload) {
    const { data } = await api.post('/api/payments/razorpay/cancel', payload);
    return data.data;
  },
  /** The customer's own payment requests with their status. */
  async mine() {
    const { data } = await api.get('/api/payments/mine');
    return data.data;
  },
};
