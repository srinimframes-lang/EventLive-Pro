import api from './api.js';

export const paymentService = {
  /** Product catalogue, pricing, UPI details and (if logged in) balance. */
  async products() {
    const { data } = await api.get('/api/payments/products');
    return data.data;
  },
  /** Submit a manual UPI payment request (pending admin approval). */
  async request(productId, reference) {
    const { data } = await api.post('/api/payments/request', { productId, reference });
    return data.data;
  },
  /** The customer's own payment requests with their status. */
  async mine() {
    const { data } = await api.get('/api/payments/mine');
    return data.data;
  },
};
