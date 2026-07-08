import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext.jsx';
import { whatsappLink } from '../utils/format.js';

export default function Footer() {
  const { settings } = useSettings();
  const wa = whatsappLink(settings.whatsappNumber);

  return (
    <footer className="site-footer border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-bold text-brand-700">{settings.companyName}</p>
          <p className="mt-1 text-sm text-slate-500">{settings.tagline}</p>
          {settings.footer && <p className="mt-2 text-xs text-slate-500">{settings.footer}</p>}
        </div>
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Quick links</p>
          <ul className="mt-2 space-y-1">
            <li>
              <Link to="/book" className="hover:text-brand-700">
                Book Now
              </Link>
            </li>
            <li>
              <Link to="/events" className="hover:text-brand-700">
                Watch Live
              </Link>
            </li>
            <li>
              <Link to="/districts" className="hover:text-brand-700">
                By District
              </Link>
            </li>
            <li>
              <Link to="/login" className="hover:text-brand-700">
                Customer Login
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Contact</p>
          <ul className="mt-2 space-y-1">
            {settings.contactPhone && <li>Phone: {settings.contactPhone}</li>}
            {settings.contactEmail && <li>Email: {settings.contactEmail}</li>}
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noreferrer" className="hover:text-brand-700">
                  WhatsApp
                </a>
              </li>
            )}
            {settings.address && <li>{settings.address}</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {settings.companyName}. All rights reserved.
      </div>
    </footer>
  );
}
