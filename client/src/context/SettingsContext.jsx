import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService } from '../services/settings.service.js';
import { tenantService } from '../services/tenant.service.js';
import { applyBrandColor, resetBrandColor } from '../utils/theme.js';

const SettingsContext = createContext(null);

const FALLBACK = {
  companyName: 'MaaEvents9 Broadcasting Services',
  tagline: 'Premium Wedding Live Streaming',
  companyLogo: '',
  whatsappNumber: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  footer: '',
  payment: {
    gpayNumber: '',
    phonepeNumber: '',
    paytmNumber: '',
    upiId: '',
    upiQr: '',
    bank: {},
  },
};

/**
 * Overlays a custom domain's branding onto the platform settings so the whole
 * app shell (Navbar/Footer/etc.) renders the customer's brand with no component
 * changes. Only non-empty branding fields override the defaults.
 */
function applyBranding(base, branding) {
  if (!branding) return base;
  const pick = (val, fallback) => (val ? val : fallback);
  return {
    ...base,
    companyName: pick(branding.businessName, base.companyName),
    companyLogo: pick(branding.logoUrl, base.companyLogo),
    tagline: pick(branding.tagline, base.tagline),
    whatsappNumber: pick(branding.whatsappNumber, base.whatsappNumber),
    contactPhone: pick(branding.contactPhone, base.contactPhone),
    contactEmail: pick(branding.contactEmail, base.contactEmail),
    address: pick(branding.address, base.address),
    footer: pick(branding.footer, base.footer),
  };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  // { isCustom, host, customerId, branding } for the current domain.
  const [tenant, setTenant] = useState({ isCustom: false });

  const refresh = useCallback(async () => {
    let base = FALLBACK;
    try {
      const data = await settingsService.get();
      base = { ...FALLBACK, ...data, payment: { ...FALLBACK.payment, ...(data.payment || {}) } };
    } catch {
      base = FALLBACK;
    }

    // White-label: resolve the current host to a customer's branding.
    try {
      const host = typeof window !== 'undefined' ? window.location.host : '';
      const resolved = host ? await tenantService.resolve(host) : { isCustom: false };
      if (resolved?.isCustom && resolved.branding) {
        setTenant(resolved);
        if (resolved.branding.primaryColor) applyBrandColor(resolved.branding.primaryColor);
        else resetBrandColor();
        setSettings(applyBranding(base, resolved.branding));
      } else {
        setTenant({ isCustom: false });
        resetBrandColor();
        setSettings(base);
      }
    } catch {
      setTenant({ isCustom: false });
      setSettings(base);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ settings, loading, tenant, refresh, setSettings }),
    [settings, loading, tenant, refresh]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
