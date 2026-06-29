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

  /** Upload one or more gallery photos. `files` is a FileList/array. */
  async uploadGallery(id, files, captions = []) {
    const fd = new FormData();
    Array.from(files).forEach((file) => fd.append('photos', file));
    captions.forEach((c) => fd.append('captions', c || ''));
    const { data } = await api.post(`/events/${id}/gallery`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data; // updated gallery array
  },

  async deleteGalleryPhoto(id, photoId) {
    const { data } = await api.delete(`/events/${id}/gallery/${photoId}`);
    return data.data;
  },

  /** Upload/replace the photography logo. */
  async uploadLogo(id, file) {
    const fd = new FormData();
    fd.append('logo', file);
    const { data } = await api.post(`/events/${id}/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data; // { photographerLogo }
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
