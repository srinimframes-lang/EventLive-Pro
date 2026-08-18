import api from './api.js';

export const youtubeService = {
  async start(returnTo = '/dashboard') {
    const { data } = await api.get('/api/youtube/oauth/start', {
      params: { returnTo, format: 'json' },
    });
    return data.data;
  },
  async status() {
    const { data } = await api.get('/api/youtube/oauth/status');
    return data.data;
  },
  async disconnect() {
    const { data } = await api.post('/api/youtube/oauth/disconnect');
    return data.data;
  },
};
