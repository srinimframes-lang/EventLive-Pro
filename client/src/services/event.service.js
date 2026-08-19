import api from './api.js';

export const eventService = {
  /**
   * @param {Record<string, string|number|boolean>} params
   */
  async list(params = {}) {
    const { data } = await api.get('/api/events', { params });
    return data; // { success, count, total, page, pages, data: [...] }
  },
  async get(idOrSlug) {
    const { data } = await api.get(`/api/events/${idOrSlug}`);
    return data.data;
  },
  async getYoutubeIngest(id) {
    const { data } = await api.get(`/api/events/${id}/youtube-ingest`);
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/api/events', payload);
    return { ...data.data, youtubeIngest: data.youtubeIngest || null };
  },
  async update(id, payload) {
    const { data } = await api.patch(`/api/events/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/api/events/${id}`);
    return data;
  },

  /** Upload one or more gallery photos. `files` is a FileList/array. */
  async uploadGallery(id, files, captions = [], onUploadProgress) {
    const fd = new FormData();
    Array.from(files).forEach((file) => fd.append('photos', file));
    captions.forEach((c) => fd.append('captions', c || ''));
    const { data } = await api.post(`/api/events/${id}/gallery`, fd, {
      onUploadProgress,
      timeout: 180_000,
    });
    return data.data;
  },

  async deleteGalleryPhoto(id, photoId) {
    const { data } = await api.delete(`/api/events/${id}/gallery/${photoId}`);
    return data.data;
  },

  async deleteGalleryPhotos(id, photoIds) {
    const { data } = await api.post(`/api/events/${id}/gallery/delete`, { photoIds });
    return data.data;
  },

  async reorderGallery(id, photoIds) {
    const { data } = await api.patch(`/api/events/${id}/gallery/reorder`, { photoIds });
    return data.data;
  },

  async setGalleryCover(id, photoId) {
    const { data } = await api.post(`/api/events/${id}/gallery/${photoId}/cover`);
    return data.data;
  },

  /** Upload/replace the photography logo. */
  async uploadLogo(id, file) {
    const fd = new FormData();
    fd.append('logo', file);
    const { data } = await api.post(`/api/events/${id}/logo`, fd);
    return data.data;
  },

  /** Upload/replace the couple (cover) photo. */
  async uploadCover(id, file) {
    const fd = new FormData();
    fd.append('cover', file);
    const { data } = await api.post(`/api/events/${id}/cover`, fd);
    return data.data;
  },

  /** Upload/replace the generated 1280x720 YouTube-style share thumbnail. */
  async uploadShareThumbnail(id, file) {
    const fd = new FormData();
    fd.append('thumbnail', file);
    const { data } = await api.post(`/api/events/${id}/share-thumbnail`, fd, {
      timeout: 120_000,
    });
    return data.data;
  },

  /** Upload classic-wedding (or template) image. kind: hero | bride | groom */
  async uploadTemplateImage(id, kind, file) {
    const fd = new FormData();
    fd.append('image', file);
    const { data } = await api.post(`/api/events/${id}/media/${kind}`, fd);
    return data.data;
  },

  /** Regenerate QR when the public live URL changed. */
  async syncQr(id) {
    const { data } = await api.post(`/api/events/${id}/qr/sync`);
    return data.data;
  },

  /** OCR a wedding invitation. Does not save event details. */
  async extractWeddingCard(file) {
    const fd = new FormData();
    fd.append('card', file);
    const { data } = await api.post('/api/events/wedding-card/extract', fd, {
      timeout: 120_000,
    });
    return data.data;
  },

  /** Review + create live link via existing YouTube provisioning. */
  async confirmWeddingCard(fields, file) {
    const fd = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      fd.append(key, value == null ? '' : String(value));
    });
    if (file) fd.append('card', file);
    const { data } = await api.post('/api/events/wedding-card/confirm', fd, {
      timeout: 120_000,
    });
    return data;
  },

  async weddingCardStatus(id) {
    const { data } = await api.get(`/api/events/wedding-card/${id}/status`);
    return data;
  },
};

export const EVENT_CATEGORIES = [
  'wedding',
  'engagement',
  'reception',
  'sangeet',
  'haldi',
  'mehendi',
  'birthday',
  'housewarming',
  'other',
];

export const LIVE_LINK_EVENT_TYPES = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'reception', label: 'Reception' },
  { id: 'sangeet', label: 'Sangeet' },
  { id: 'haldi', label: 'Haldi' },
  { id: 'mehendi', label: 'Mehendi' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'housewarming', label: 'Housewarming' },
  { id: 'other', label: 'Other' },
];

export const EVENT_STATUSES = ['draft', 'published', 'live', 'ended', 'cancelled'];
