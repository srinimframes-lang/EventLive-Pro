import api from './api.js';

export const bookingService = {
  /** Customer submits a booking with payment screenshot (multipart). */
  async create({ screenshot, ...fields }) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') fd.append(k, v);
    });
    if (screenshot) fd.append('screenshot', screenshot);
    const { data } = await api.post('/api/bookings', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
