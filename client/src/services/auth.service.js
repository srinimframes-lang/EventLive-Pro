import api from './api.js';

export const authService = {
  async register(payload) {
    const { data } = await api.post('auth.service.js', payload);
    return data;
  },
  async login(payload) {
    const { data } = await api.post('/auth/login', payload);
    return data;
  },
  async logout() {
    const { data } = await api.post('/auth/logout');
    return data;
  },
  async me() {
    const { data } = await api.get('/auth/me');
    return data;
  },
};
