import { useEffect, useRef, useState } from 'react';
import { tenantService } from '../services/tenant.service.js';
import { resolveMediaUrl } from '../utils/format.js';

const BRANDING_DEFAULTS = {
  businessName: '',
  tagline: '',
  primaryColor: '',
  whatsappNumber: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  footer: '',
  logoUrl: '',
};

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
};

export default function WhiteLabelPanel({ initialBranding }) {
  const [branding, setBranding] = useState({ ...BRANDING_DEFAULTS, ...(initialBranding || {}) });
  const [domains, setDomains] = useState([]);
  const [newHost, setNewHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const logoRef = useRef(null);

  const flash = (m) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 2500);
  };

  const loadDomains = async () => {
    try {
      const data = await tenantService.myDomains();
      setDomains(data.domains || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  const onField = (e) => setBranding((b) => ({ ...b, [e.target.name]: e.target.value }));

  const saveBranding = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await tenantService.updateBranding(branding);
      flash('Branding saved. It appears on your custom domain.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { logoUrl } = await tenantService.uploadBrandingLogo(file);
      setBranding((b) => ({ ...b, logoUrl }));
      flash('Logo uploaded');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const addDomain = async (e) => {
    e.preventDefault();
    if (!newHost.trim()) return;
    setBusy(true);
    setError('');
    try {
      await tenantService.addDomain(newHost.trim());
      setNewHost('');
      await loadDomains();
      flash('Domain added. Add the DNS records, then verify.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (id) => {
    setError('');
    try {
      const updated = await tenantService.verifyDomain(id);
      setDomains((list) => list.map((d) => (d.id === id ? updated : d)));
      flash(updated.dnsVerified ? 'DNS verified! Awaiting admin approval.' : 'DNS record not found yet.');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this domain?')) return;
    try {
      await tenantService.deleteDomain(id);
      setDomains((list) => list.filter((d) => d.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card mt-8">
      <h2 className="text-lg font-bold text-slate-900">White-label branding &amp; domains</h2>
      <p className="mt-1 text-sm text-slate-500">
        Run your live pages on your own domain with your own branding.
      </p>

      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Branding */}
      <form onSubmit={saveBranding} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Business name">
          <input name="businessName" className="input" value={branding.businessName} onChange={onField} />
        </Field>
        <Field label="Tagline">
          <input name="tagline" className="input" value={branding.tagline} onChange={onField} />
        </Field>
        <Field label="Primary color (hex)">
          <div className="flex items-center gap-2">
            <input
              name="primaryColor"
              className="input"
              placeholder="#be185d"
              value={branding.primaryColor}
              onChange={onField}
            />
            <input
              type="color"
              className="h-10 w-10 rounded border border-slate-200"
              value={/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor) ? branding.primaryColor : '#be185d'}
              onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
            />
          </div>
        </Field>
        <Field label="WhatsApp number">
          <input name="whatsappNumber" className="input" value={branding.whatsappNumber} onChange={onField} />
        </Field>
        <Field label="Contact phone">
          <input name="contactPhone" className="input" value={branding.contactPhone} onChange={onField} />
        </Field>
        <Field label="Contact email">
          <input name="contactEmail" className="input" value={branding.contactEmail} onChange={onField} />
        </Field>
        <Field label="Address">
          <input name="address" className="input" value={branding.address} onChange={onField} />
        </Field>
        <Field label="Footer text">
          <input name="footer" className="input" value={branding.footer} onChange={onField} />
        </Field>
        <Field label="Logo">
          <div className="flex items-center gap-3">
            {branding.logoUrl && (
              <img src={resolveMediaUrl(branding.logoUrl)} alt="logo" className="h-10 w-10 rounded object-cover" />
            )}
            <input ref={logoRef} type="file" accept="image/*" onChange={uploadLogo} className="text-sm" />
          </div>
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save branding'}
          </button>
        </div>
      </form>

      {/* Domains */}
      <div className="mt-6 border-t border-slate-100 pt-4">
        <form onSubmit={addDomain} className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Add a custom domain</label>
            <input
              className="input"
              placeholder="live.yourbusiness.com"
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-outline" disabled={busy}>
            Add domain
          </button>
        </form>

        <ul className="mt-4 space-y-3">
          {domains.length === 0 && <li className="text-sm text-slate-500">No domains yet.</li>}
          {domains.map((d) => (
            <li key={d.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{d.host}</p>
                  <p className="text-xs text-slate-500">
                    DNS {d.dnsVerified ? '✓ verified' : 'not verified'} · SSL {d.sslStatus}
                  </p>
                </div>
                <span className={`badge ${STATUS_STYLES[d.status] || 'bg-slate-100 text-slate-600'}`}>
                  {d.status}
                </span>
              </div>

              {d.status !== 'active' && d.verification && (
                <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">Add these DNS records at your registrar:</p>
                  <code className="block break-all">
                    TXT &nbsp;{d.verification.name}&nbsp;=&nbsp;{d.verification.value}
                  </code>
                  <code className="block break-all">
                    CNAME &nbsp;{d.host}&nbsp;→&nbsp;{d.verification.cname?.value}
                  </code>
                  <p className="text-slate-400">
                    After adding them, click Verify. An admin then approves the domain to go live.
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {d.status !== 'active' && (
                  <button type="button" className="btn-outline" onClick={() => verify(d.id)}>
                    Verify DNS
                  </button>
                )}
                {d.status === 'active' && (
                  <a href={`https://${d.host}`} target="_blank" rel="noreferrer" className="btn-outline">
                    Open site
                  </a>
                )}
                <button type="button" className="btn-ghost text-red-600" onClick={() => remove(d.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
