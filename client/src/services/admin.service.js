import api from './api.js';

export const adminService = {
  async analytics() {
    const { data } = await api.get('/api/admin/analytics');
    return data.data;
  },
  async listCustomers() {
    const { data } = await api.get('/api/admin/customers');
    return data.data;
  },
  async createCustomer(payload) {
    const { data } = await api.post('/api/admin/customers', payload);
    return data.data;
  },
  async updateCustomer(id, payload) {
    const { data } = await api.patch(`/api/admin/customers/${id}`, payload);
    return data.data;
  },
  async deleteCustomer(id) {
    const { data } = await api.delete(`/api/admin/customers/${id}`);
    return data;
  },
};
