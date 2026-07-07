import api from './api.js';

export const themeService = {
  async list(category, region) {
    const params = {};
    if (category) params.category = category;
    if (region) params.region = region;
    const { data } = await api.get('/api/themes', { params });
    return data.data;
  },
  async regions() {
    const { data } = await api.get('/api/themes/regions');
    return data.data;
  },
  async categories() {
    const { data } = await api.get('/api/themes/categories');
    return data.data;
  },
  async get(idOrSlug) {
    const { data } = await api.get(`/api/themes/${idOrSlug}`);
    return data.data;
  },

  // Admin
  async adminList(category, region) {
    const params = {};
    if (category) params.category = category;
    if (region) params.region = region;
    const { data } = await api.get('/api/admin/themes', { params });
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/api/admin/themes', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/api/admin/themes/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/api/admin/themes/${id}`);
    return data.data;
  },
  async uploadBackground(id, file) {
    const form = new FormData();
    form.append('background', file);
    const { data } = await api.post(`/api/admin/themes/${id}/background`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
  async duplicate(id) {
    const { data } = await api.post(`/api/admin/themes/${id}/duplicate`);
    return data.data;
  },
  async reseedRegional() {
    const { data } = await api.post('/api/admin/themes/reseed-regional');
    return data.data;
  },
};
