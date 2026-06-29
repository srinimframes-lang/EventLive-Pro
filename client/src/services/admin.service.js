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
  /** Add (positive) or remove (negative) credits for a customer. */
  async adjustCustomerCredits(id, amount, note) {
    const { data } = await api.post(`/api/admin/customers/${id}/credits`, { amount, note });
    return data.data;
  },

  // ── Sub admins (resellers) ──────────────────────────────
  async listSubAdmins() {
    const { data } = await api.get('/api/admin/subadmins');
    return data.data;
  },
  async createSubAdmin(payload) {
    const { data } = await api.post('/api/admin/subadmins', payload);
    return data.data;
  },
  async updateSubAdmin(id, payload) {
    const { data } = await api.patch(`/api/admin/subadmins/${id}`, payload);
    return data.data;
  },
  async deleteSubAdmin(id) {
    const { data } = await api.delete(`/api/admin/subadmins/${id}`);
    return data;
  },
  async adjustCredits(id, payload) {
    const { data } = await api.post(`/api/admin/subadmins/${id}/credits`, payload);
    return data.data;
  },

  // ── Credit orders ───────────────────────────────────────
  async listCreditOrders(status) {
    const { data } = await api.get('/api/admin/credit-orders', {
      params: status ? { status } : {},
    });
    return data.data;
  },
  async approveCreditOrder(id, adminNote) {
    const { data } = await api.post(`/api/admin/credit-orders/${id}/approve`, { adminNote });
    return data.data;
  },
  async rejectCreditOrder(id, adminNote) {
    const { data } = await api.post(`/api/admin/credit-orders/${id}/reject`, { adminNote });
    return data.data;
  },
};
