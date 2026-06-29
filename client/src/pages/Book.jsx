import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { packageService } from '../services/package.service.js';
import { formatCurrency, whatsappLink } from '../utils/format.js';

export default function Book() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    packageService
      .list()
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  const wa = whatsappLink(
    settings.whatsappNumber,
    `Hi ${settings.companyName}, I'd like to book a wedding live stream.`
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold text-slate-900">Book your wedding stream</h1>
        <p className="mt-2 text-slate-600">
          Choose a package below. {isAuthenticated && !isAdmin ? 'Then confirm your booking and upload payment proof.' : 'Already a customer? Log in to book. New here? Message us to get started.'}
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {packages.map((p, i) => (
          <div key={p.id} className={`card flex flex-col ${i === 1 ? 'ring-2 ring-gold-400' : ''}`}>
            {i === 1 && (
              <span className="badge mb-2 self-start bg-gold-100 text-gold-700">Most popular</span>
            )}
            <h3 className="font-display text-2xl font-bold text-slate-900">{p.name}</h3>
            <p className="mt-2 text-3xl font-extrabold text-brand-700">
              {formatCurrency(p.price, p.currency)}
            </p>
            {p.durationLabel && <p className="mt-1 text-sm text-slate-500">{p.durationLabel}</p>}
            {p.description && <p className="mt-3 text-sm text-slate-600">{p.description}</p>}
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {(p.features || []).map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-gold-500">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {isAuthenticated && !isAdmin ? (
              <Link to={`/book/new?package=${p.id}`} className="btn-primary mt-6 w-full">
                Book {p.name}
              </Link>
            ) : (
              <Link to="/login" className="btn-primary mt-6 w-full">
                Login to book
              </Link>
            )}
          </div>
        ))}
      </div>

      {loading && <p className="mt-10 text-center text-slate-500">Loading packages…</p>}
      {!loading && packages.length === 0 && (
        <p className="mt-10 text-center text-slate-500">Packages will appear here soon.</p>
      )}

      {!isAuthenticated && (
        <div className="mt-12 card flex flex-col items-center gap-4 bg-gradient-to-br from-brand-50 to-gold-50 text-center">
          <h2 className="font-display text-2xl font-bold text-slate-900">New customer?</h2>
          <p className="max-w-xl text-slate-600">
            Create an account to get started. Once our team approves it, you can choose a package and
            book your wedding live stream.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary px-6 py-3">
              Create account
            </Link>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="btn-gold px-6 py-3">
                Message us on WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
