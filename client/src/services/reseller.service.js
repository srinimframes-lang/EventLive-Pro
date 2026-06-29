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
  /** Submit a credit top-up order with payment proof (multipart). */
  async buyCredits({ screenshot, ...fields }) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') fd.append(k, v);
    });
    if (screenshot) fd.append('screenshot', screenshot);
    const { data } = await api.post('/api/reseller/credit-orders', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
};
