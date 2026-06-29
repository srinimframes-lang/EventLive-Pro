import api from './api.js';

export const paymentService = {
  /** Product catalogue, pricing, link costs and (if logged in) balance. */
  async products() {
    const { data } = await api.get('/api/payments/products');
    return data.data;
  },
  /** Start a credit purchase; returns the gateway redirect URL. */
  async create(productId) {
    const { data } = await api.post('/api/payments/create', { productId });
    return data.data;
  },
  /** Check (and finalize) a payment after returning from the gateway. */
  async status(mtid) {
    const { data } = await api.get(`/api/payments/status/${mtid}`);
    return data.data;
  },
  async mine() {
    const { data } = await api.get('/api/payments/mine');
    return data.data;
  },
};
