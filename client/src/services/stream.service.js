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
  async setDisabled(eventId, disabled) {
    const { data } = await api.post(`/api/events/${eventId}/stream/disable`, { disabled });
    return data.data;
  },
  async restart(eventId) {
    const { data } = await api.post(`/api/events/${eventId}/stream/restart`);
    return data.data;
  },
  async getRecordingMeta(eventId) {
    const { data } = await api.get(`/api/events/${eventId}/stream/recording/meta`);
    return data.data;
  },
  async hideRecording(eventId) {
    const { data } = await api.post(`/api/events/${eventId}/stream/recording/hide`);
    return data.data;
  },
  async restoreRecording(eventId) {
    const { data } = await api.post(`/api/events/${eventId}/stream/recording/restore`);
    return data.data;
  },
  async deleteRecording(eventId) {
    const { data } = await api.delete(`/api/events/${eventId}/stream/recording`);
    return data.data;
  },
  recordingPlayUrl(eventId) {
    return `/api/events/${eventId}/stream/recording`;
  },
  recordingDownloadUrl(eventId) {
    return `/api/events/${eventId}/stream/recording/download`;
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
