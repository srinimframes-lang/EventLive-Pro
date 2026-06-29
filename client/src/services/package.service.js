import api from './api.js';

export const packageService = {
  async list() {
    const { data } = await api.get('/api/packages');
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/api/packages', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/api/packages/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/api/packages/${id}`);
    return data;
  },
};
