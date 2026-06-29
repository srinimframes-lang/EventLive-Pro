import api from './api.js';

export const bookingService = {
  /** Customer submits a booking enquiry (payments are handled via credits). */
  async create(fields) {
    const { data } = await api.post('/api/bookings', fields);
    return data.data;
  },
  async mine() {
    const { data } = await api.get('/api/bookings/mine');
    return data.data;
  },
  async get(id) {
    const { data } = await api.get(`/api/bookings/${id}`);
    return data.data;
  },
  // Admin
  async listAll(status) {
    const { data } = await api.get('/api/bookings', { params: status ? { status } : {} });
    return data.data;
  },
  async approve(id, adminNote) {
    const { data } = await api.post(`/api/bookings/${id}/approve`, { adminNote });
    return data.data;
  },
  async reject(id, adminNote) {
    const { data } = await api.post(`/api/bookings/${id}/reject`, { adminNote });
    return data.data;
  },
};
