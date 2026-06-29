import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService } from '../services/settings.service.js';

const SettingsContext = createContext(null);

const FALLBACK = {
  companyName: 'MaaEvents9 Broadcasting Services',
  tagline: 'Premium Wedding Live Streaming',
  companyLogo: '',
  whatsappNumber: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  payment: {
    gpayNumber: '',
    phonepeNumber: '',
    paytmNumber: '',
    upiId: '',
    upiQr: '',
    bank: {},
  },
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await settingsService.get();
      setSettings({ ...FALLBACK, ...data, payment: { ...FALLBACK.payment, ...(data.payment || {}) } });
    } catch {
      setSettings(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ settings, loading, refresh, setSettings }), [settings, loading, refresh]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
