import api from './api.js';

export const streamService = {
  async getConfig(eventId) {
    const { data } = await api.get(`/api/events/${eventId}/stream`);
    return data.data;
  },
  async updateConfig(eventId, payload) {
    const { data } = await api.patch(`/api/events/${eventId}/stream`, payload);
    return data.data;
  },
  async getKey(eventId) {
    const { data } = await api.get(`/api/events/${eventId}/stream/key`);
    return data.data; // { ingestUrl, streamKey, fullUrl }
  },
  async regenerateKey(eventId) {
    const { data } = await api.post(`/api/events/${eventId}/stream/key/regenerate`);
    return data.data;
  },
  async setLive(eventId, live) {
    const { data } = await api.post(`/api/events/${eventId}/stream/live`, { live });
    return data.data;
  },
  async getChatHistory(eventId, limit = 50) {
    const { data } = await api.get(`/api/events/${eventId}/chat`, { params: { limit } });
    return data.data;
  },
  async getQuestions(eventId) {
    const { data } = await api.get(`/api/events/${eventId}/questions`);
    return data.data;
  },
};

export const STREAM_PROVIDERS = ['none', 'youtube', 'hls', 'webrtc', 'rtmp'];
