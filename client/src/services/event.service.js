import api from './api.js';

export const eventService = {
  /**
   * @param {Record<string, string|number|boolean>} params
   */
  async list(params = {}) {
    const { data } = await api.get('/events', { params });
    return data; // { success, count, total, page, pages, data: [...] }
  },
  async get(idOrSlug) {
    const { data } = await api.get(`/events/${idOrSlug}`);
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/events', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/events/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/events/${id}`);
    return data;
  },
};

export const EVENT_CATEGORIES = [
  'conference',
  'workshop',
  'webinar',
  'concert',
  'meetup',
  'sports',
  'other',
];

export const EVENT_STATUSES = ['draft', 'published', 'live', 'ended', 'cancelled'];
