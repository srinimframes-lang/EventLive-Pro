import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext.jsx';
import { settingsService } from '../../services/settings.service.js';
import { resolveMediaUrl } from '../../utils/format.js';

export default function AdminSettings() {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const top = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const seoField = (e) =>
    setForm((f) => ({ ...f, seo: { ...(f.seo || {}), [e.target.name]: e.target.value } }));
  const pay = (e) =>
    setForm((f) => ({ ...f, payment: { ...f.payment, [e.target.name]: e.target.value } }));
  const bank = (e) =>
    setForm((f) => ({
      ...f,
      payment: { ...f.payment, bank: { ...(f.payment.bank || {}), [e.target.name]: e.target.value } },
    }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await settingsService.update({
        companyName: form.companyName,
        tagline: form.tagline,
        whatsappNumber: form.whatsappNumber,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        address: form.address,
        googleAnalyticsId: form.googleAnalyticsId,
        googleSearchConsoleVerification: form.googleSearchConsoleVerification,
        seo: form.seo,
        payment: form.payment,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    try {
      await settingsService.uploadLogo(file);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadQr = async (file) => {
    if (!file) return;
    try {
      await settingsService.uploadQr(file);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const p = form.payment || {};
  const b = p.bank || {};

  return (
    <form onSubmit={save} className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Settings saved.</p>
      )}

      {/* Branding */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Branding</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Company name</label>
            <input name="companyName" className="input" value={form.companyName || ''} onChange={top} />
          </div>
          <div>
            <label className="label">Tagline</label>
            <input name="tagline" className="input" value={form.tagline || ''} onChange={top} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          {resolveMediaUrl(form.companyLogo) && (
            <img
              src={resolveMediaUrl(form.companyLogo)}
              alt="Logo"
              className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
            />
          )}
          <div>
            <label className="label">Company logo</label>
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={(e) => uploadLogo(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">WhatsApp number</label>
            <input
              name="whatsappNumber"
              className="input"
              placeholder="91XXXXXXXXXX"
              value={form.whatsappNumber || ''}
              onChange={top}
            />
          </div>
          <div>
            <label className="label">Contact phone</label>
            <input name="contactPhone" className="input" value={form.contactPhone || ''} onChange={top} />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input name="contactEmail" className="input" value={form.contactEmail || ''} onChange={top} />
          </div>
          <div>
            <label className="label">Address</label>
            <input name="address" className="input" value={form.address || ''} onChange={top} />
          </div>
        </div>
      </div>

      {/* SEO & analytics */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">SEO &amp; analytics</h2>
        <p className="text-xs text-slate-500">
          Controls site-wide meta tags, Google Analytics, and Search Console verification.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Site URL (canonical base)</label>
            <input
              name="siteUrl"
              className="input"
              placeholder="https://eventlivepro.com"
              value={form.seo?.siteUrl || ''}
              onChange={seoField}
            />
          </div>
          <div>
            <label className="label">Default OG image URL</label>
            <input
              name="defaultOgImage"
              className="input"
              placeholder="https://…"
              value={form.seo?.defaultOgImage || ''}
              onChange={seoField}
            />
          </div>
          <div>
            <label className="label">Homepage title</label>
            <input
              name="homepageTitle"
              className="input"
              value={form.seo?.homepageTitle || ''}
              onChange={seoField}
            />
          </div>
          <div>
            <label className="label">Homepage meta description</label>
            <input
              name="homepageDescription"
              className="input"
              value={form.seo?.homepageDescription || ''}
              onChange={seoField}
            />
          </div>
          <div>
            <label className="label">Google Analytics ID (G-XXXXXXXX)</label>
            <input
              name="googleAnalyticsId"
              className="input"
              placeholder="G-XXXXXXXXXX"
              value={form.googleAnalyticsId || ''}
              onChange={top}
            />
          </div>
          <div>
            <label className="label">Google Search Console verification</label>
            <input
              name="googleSearchConsoleVerification"
              className="input"
              placeholder="verification token"
              value={form.googleSearchConsoleVerification || ''}
              onChange={top}
            />
          </div>
        </div>
      </div>

      {/* UPI payment — shown to customers on the Buy Credits page */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">UPI payment (shown to customers)</h2>
          <p className="text-xs text-slate-500">
            These details appear on the customer&apos;s Buy Credits page. Nothing is hardcoded.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center">
            {resolveMediaUrl(p.upiQr) ? (
              <img
                src={resolveMediaUrl(p.upiQr)}
                alt="UPI QR code"
                className="h-32 w-32 rounded-lg border border-slate-200 object-contain p-1"
              />
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                No QR uploaded
              </div>
            )}
            <label className="label mt-2">QR code image</label>
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={(e) => uploadQr(e.target.files?.[0])}
            />
          </div>

          <div className="grid flex-1 gap-4">
            <div>
              <label className="label">UPI ID</label>
              <input
                name="upiId"
                className="input"
                placeholder="yourname@bank"
                value={p.upiId || ''}
                onChange={pay}
              />
            </div>
            <div>
              <label className="label">Account holder name</label>
              <input
                name="upiName"
                className="input"
                placeholder="As shown in your UPI app"
                value={p.upiName || ''}
                onChange={pay}
              />
            </div>
            <div>
              <label className="label">Payment instructions (shown to customers)</label>
              <textarea
                name="instructions"
                className="input"
                rows={2}
                placeholder="e.g. After paying, enter the transaction ID and tap I Have Paid. Credits are added after we verify."
                value={p.instructions || ''}
                onChange={pay}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Optional extras */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Other payment options (optional)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Google Pay number</label>
            <input name="gpayNumber" className="input" value={p.gpayNumber || ''} onChange={pay} />
          </div>
          <div>
            <label className="label">PhonePe number</label>
            <input name="phonepeNumber" className="input" value={p.phonepeNumber || ''} onChange={pay} />
          </div>
          <div>
            <label className="label">Paytm number</label>
            <input name="paytmNumber" className="input" value={p.paytmNumber || ''} onChange={pay} />
          </div>
        </div>

        <h3 className="pt-2 font-semibold text-slate-800">Bank account</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Account holder name</label>
            <input name="accountName" className="input" value={b.accountName || ''} onChange={bank} />
          </div>
          <div>
            <label className="label">Account number</label>
            <input name="accountNumber" className="input" value={b.accountNumber || ''} onChange={bank} />
          </div>
          <div>
            <label className="label">IFSC</label>
            <input name="ifsc" className="input" value={b.ifsc || ''} onChange={bank} />
          </div>
          <div>
            <label className="label">Bank name</label>
            <input name="bankName" className="input" value={b.bankName || ''} onChange={bank} />
          </div>
          <div>
            <label className="label">Branch</label>
            <input name="branch" className="input" value={b.branch || ''} onChange={bank} />
          </div>
        </div>
      </div>

      <button type="submit" className="btn-primary px-6 py-3" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
      <p className="text-xs text-slate-500">
        Logo and QR images upload immediately. Other fields save when you click Save settings.
      </p>
    </form>
  );
}
