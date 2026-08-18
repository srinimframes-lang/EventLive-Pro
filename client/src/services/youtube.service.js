import api from './api.js';
import { API_ORIGIN } from '../config.js';

/** Same Render origin as login/events — never call eventlivepro.com/api. */
function youtubeUrl(path) {
  return `${API_ORIGIN}/api/youtube${path}`;
}

export const youtubeService = {
  async start(returnTo = '/dashboard') {
    const { data } = await api.get(youtubeUrl('/oauth/start'), {
      params: { returnTo, format: 'json' },
    });
    return data.data;
  },
  async status() {
    const { data } = await api.get(youtubeUrl('/oauth/status'));
    return data.data;
  },
  async disconnect() {
    const { data } = await api.post(youtubeUrl('/oauth/disconnect'));
    return data.data;
  },
};
