import api from './api.js';

export const BANNER_LOCATIONS = [
  { id: 'homepage', label: 'Homepage' },
  { id: 'live_player', label: 'Below live player' },
  { id: 'gallery', label: 'Gallery section' },
  { id: 'footer', label: 'Footer' },
];

export const bannerService = {
  async listActive(location) {
    const { data } = await api.get('/api/banners', { params: { location } });
    return data.data || [];
  },
  async trackView(id) {
    await api.post(`/api/banners/${id}/view`).catch(() => {});
  },
  async trackClick(id) {
    const { data } = await api.post(`/api/banners/${id}/click`);
    return data.data;
  },

  async adminList() {
    const { data } = await api.get('/api/admin/banners');
    return data.data || [];
  },
  async adminCreate(formData) {
    const { data } = await api.post('/api/admin/banners', formData);
    return data.data;
  },
  async adminUpdate(id, payload) {
    const { data } = await api.patch(`/api/admin/banners/${id}`, payload);
    return data.data;
  },
  async adminUploadImage(id, file) {
    const fd = new FormData();
    fd.append('image', file);
    const { data } = await api.post(`/api/admin/banners/${id}/image`, fd);
    return data.data;
  },
  async adminDelete(id) {
    const { data } = await api.delete(`/api/admin/banners/${id}`);
    return data;
  },
};
