import api from './api.js';

export const tenantService = {
  // Public: resolve a host to its white-label branding.
  async resolve(host) {
    const { data } = await api.get('/api/tenant/resolve', { params: { host } });
    return data.data; // { isCustom, host?, customerId?, branding? }
  },

  // Authenticated customer self-service.
  async myDomains() {
    const { data } = await api.get('/api/tenant/my-domains');
    return data.data; // { domains, activeHost }
  },
  async addDomain(host) {
    const { data } = await api.post('/api/tenant/my-domains', { host });
    return data.data;
  },
  async verifyDomain(id) {
    const { data } = await api.post(`/api/tenant/my-domains/${id}/verify`);
    return data.data;
  },
  async deleteDomain(id) {
    const { data } = await api.delete(`/api/tenant/my-domains/${id}`);
    return data.data;
  },
  async updateBranding(payload) {
    const { data } = await api.patch('/api/tenant/my-branding', payload);
    return data.data;
  },
  async uploadBrandingLogo(file) {
    const form = new FormData();
    form.append('logo', file);
    const { data } = await api.post('/api/tenant/my-branding/logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data; // { logoUrl }
  },
};
