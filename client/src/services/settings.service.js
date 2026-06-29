import api from './api.js';

export const settingsService = {
  async get() {
    const { data } = await api.get('/api/settings');
    return data.data;
  },
  async update(payload) {
    const { data } = await api.patch('/api/settings', payload);
    return data.data;
  },
  async uploadLogo(file) {
    const fd = new FormData();
    fd.append('logo', file);
    const { data } = await api.post('/api/settings/logo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
  async uploadQr(file) {
    const fd = new FormData();
    fd.append('qr', file);
    const { data } = await api.post('/api/settings/qr', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
};
