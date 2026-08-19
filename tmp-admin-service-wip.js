import api from './api.js';

export const adminService = {
  async analytics() {
    const { data } = await api.get('/api/admin/analytics');
    return data.data;
  },
  async listCustomers() {
    const { data } = await api.get('/api/admin/customers');
    return data.data;
  },
  async createCustomer(payload) {
    const { data } = await api.post('/api/admin/customers', payload);
    return data.data;
  },
  async updateCustomer(id, payload) {
    const { data } = await api.patch(`/api/admin/customers/${id}`, payload);
    return data.data;
  },
  async deleteCustomer(id) {
    const { data } = await api.delete(`/api/admin/customers/${id}`);
    return data;
  },
  /** Add (positive) or remove (negative) credits for a customer. */
  async adjustCustomerCredits(id, amount, note) {
    const { data } = await api.post(`/api/admin/customers/${id}/credits`, { amount, note });
    return data.data;
  },

  // ── Credit payment requests (manual UPI) ────────────────
  async listPayments(status) {
    const { data } = await api.get('/api/admin/payments', {
      params: status ? { status } : {},
    });
    return data.data;
  },
  async approvePayment(id, adminNote) {
    const { data } = await api.post(`/api/admin/payments/${id}/approve`, { adminNote });
    return data.data;
  },
  async rejectPayment(id, adminNote) {
    const { data } = await api.post(`/api/admin/payments/${id}/reject`, { adminNote });
    return data.data;
  },
  async voidPayment(id) {
    const { data } = await api.delete(`/api/admin/payments/${id}`);
    return data.data;
  },

  // ── Tenant admins (Super Admin) ─────────────────────────
  async listAdmins() {
    const { data } = await api.get('/api/admin/admins');
    return data.data;
  },
  async createAdmin(payload) {
    const { data } = await api.post('/api/admin/admins', payload);
    return data.data;
  },
  async updateAdmin(id, payload) {
    const { data } = await api.patch(`/api/admin/admins/${id}`, payload);
    return data.data;
  },
  async deleteAdmin(id) {
    const { data } = await api.delete(`/api/admin/admins/${id}`);
    return data;
  },

  // ── Sub admins (resellers) ──────────────────────────────
  async listSubAdmins() {
    const { data } = await api.get('/api/admin/subadmins');
    return data.data;
  },
  async createSubAdmin(payload) {
    const { data } = await api.post('/api/admin/subadmins', payload);
    return data.data;
  },
  async updateSubAdmin(id, payload) {
    const { data } = await api.patch(`/api/admin/subadmins/${id}`, payload);
    return data.data;
  },
  async deleteSubAdmin(id) {
    const { data } = await api.delete(`/api/admin/subadmins/${id}`);
    return data;
  },
  async adjustCredits(id, payload) {
    const { data } = await api.post(`/api/admin/subadmins/${id}/credits`, payload);
    return data.data;
  },

  // ── Credit orders ───────────────────────────────────────
  async listCreditOrders(status) {
    const { data } = await api.get('/api/admin/credit-orders', {
      params: status ? { status } : {},
    });
    return data.data;
  },
  async approveCreditOrder(id, adminNote) {
    const { data } = await api.post(`/api/admin/credit-orders/${id}/approve`, { adminNote });
    return data.data;
  },
  async rejectCreditOrder(id, adminNote) {
    const { data } = await api.post(`/api/admin/credit-orders/${id}/reject`, { adminNote });
    return data.data;
  },

  // ── White-label: custom domains ─────────────────────────
  async domainIntegration() {
    const { data } = await api.get('/api/admin/domains/integration');
    return data.data; // { vercel: { enabled, projectId, team } }
  },
  async listDomains() {
    const { data } = await api.get('/api/admin/domains');
    return data.data;
  },
  async createDomain(payload) {
    const { data } = await api.post('/api/admin/domains', payload);
    return { ...(data.data || {}), meta: data.meta };
  },
  async verifyDomain(id) {
    const { data } = await api.post(`/api/admin/domains/${id}/verify`);
    return { domain: data.data, message: data.message, dnsCheck: data.dnsCheck };
  },
  async approveDomain(id, force) {
    const { data } = await api.post(`/api/admin/domains/${id}/approve`, { force: Boolean(force) });
    return data.data;
  },
  async suspendDomain(id) {
    const { data } = await api.post(`/api/admin/domains/${id}/suspend`);
    return data.data;
  },
  /** Suspend apex EventLive mapping and ensure live.<apex> exists (no delete). */
  async migrateDomainToLive(id) {
    const { data } = await api.post(`/api/admin/domains/${id}/migrate-to-live`);
    return { ...(data.data || {}), message: data.message };
  },
  async refreshDomain(id) {
    const { data } = await api.post(`/api/admin/domains/${id}/refresh`);
    return data.data;
  },
  async removeDomain(id) {
    const { data } = await api.delete(`/api/admin/domains/${id}`);
    return data.data;
  },

  // ── System Health (Super Admin) ─────────────────────────
  async getSystemHealth() {
    const { data } = await api.get('/api/admin/system-health');
    return data.data;
  },
  async getSystemHealthLogs(params = {}) {
    const { data } = await api.get('/api/admin/system-health/logs', { params });
    return data.data;
  },
  async runSystemHealthTest(test) {
    const { data } = await api.post('/api/admin/system-health/test', { test });
    return data.data;
  },
  async restartSystemService(service) {
    const { data } = await api.post('/api/admin/system-health/restart', { service });
    return data.data;
  },
  async ackSystemHealth(payload) {
    const { data } = await api.post('/api/admin/system-health/ack', payload);
    return data.data;
  },

  // ── Backup Manager (Super Admin) ────────────────────────
  async getBackupStatus() {
    const { data } = await api.get('/api/admin/backups/status');
    return data.data;
  },
  async listBackups(params = {}) {
    const { data } = await api.get('/api/admin/backups', { params });
    return data.data;
  },
  async runBackup() {
    const { data } = await api.post('/api/admin/backups/run', {}, { timeout: 30 * 60 * 1000 });
    if (!data.success) throw new Error(data.message || 'Backup failed');
    return data.data;
  },
  async restoreBackup(id, payload) {
    const { data } = await api.post(`/api/admin/backups/${id}/restore`, payload, {
      timeout: 60 * 60 * 1000,
    });
    return data.data;
  },
  async downloadBackup(id) {
    const base = api.defaults.baseURL || '';
    const token = localStorage.getItem('token');
    const url = `${base}/api/admin/backups/${encodeURIComponent(id)}/download`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try {
        const j = await res.json();
        if (j.message) msg = j.message;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    // R2 redirect or zip body
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json();
      throw new Error(j.message || 'Download unavailable');
    }
    const blob = await res.blob();
    const disp = res.headers.get('content-disposition') || '';
    const m = /filename="?([^"]+)"?/i.exec(disp);
    const filename = m?.[1] || `backup-${id}.zip`;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  },

  // ── Alerts (Super Admin) ────────────────────────────────
  async getAlertSettings() {
    const { data } = await api.get('/api/admin/alerts/settings');
    return data.data;
  },
  async updateAlertSettings(payload) {
    const { data } = await api.patch('/api/admin/alerts/settings', payload);
    return data.data;
  },
  async getAlertHistory(params = {}) {
    const { data } = await api.get('/api/admin/alerts/history', { params });
    return data.data;
  },
  async testAlert() {
    const { data } = await api.post('/api/admin/alerts/test');
    return data.data;
  },
  async retryAlert(id) {
    const { data } = await api.post(`/api/admin/alerts/${id}/retry`);
    return data.data;
  },

  /** Cloudflare R2 status for gallery / recordings (no secrets). */
  async getR2StorageStatus() {
    const { data } = await api.get('/api/admin/storage/r2');
    return data.data;
  },

  // ── White-label: per-customer branding ──────────────────
  async updateCustomerBranding(id, payload) {
    const { data } = await api.patch(`/api/admin/customers/${id}/branding`, payload);
    return data.data;
  },
};
