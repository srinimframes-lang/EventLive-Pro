import api from './api.js';

export const resellerService = {
  /** Balance, pricing and recent ledger entries. */
  async me() {
    const { data } = await api.get('/api/reseller/me');
    return data.data;
  },
  async transactions() {
    const { data } = await api.get('/api/reseller/transactions');
    return data.data;
  },
  async myEvents() {
    const { data } = await api.get('/api/reseller/events');
    return data.data;
  },
  async myOrders() {
    const { data } = await api.get('/api/reseller/credit-orders');
    return data.data;
  },
  /** Submit a credit top-up order (no screenshot — payments use the gateway). */
  async buyCredits(fields) {
    const { data } = await api.post('/api/reseller/credit-orders', fields);
    return data.data;
  },
};
