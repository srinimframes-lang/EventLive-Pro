import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { resolveMediaUrl } from '../utils/format.js';

export default function Navbar() {
  const { isAuthenticated, isAdmin, isSubAdmin, user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const handleLogout = async () => {
    close();
    await logout();
    navigate('/');
  };

  const homeFor = isAdmin ? '/admin' : isSubAdmin ? '/reseller' : '/dashboard';
  const homeLabel = isAdmin ? 'Admin' : isSubAdmin ? 'Reseller' : 'Dashboard';
  const logoUrl = resolveMediaUrl(settings.companyLogo);

  const NavLinks = ({ stacked }) => (
    <>
      <Link to="/book" onClick={close} className={`btn-ghost ${stacked ? 'justify-start' : ''}`}>
        Book Now
      </Link>
      <Link to="/events" onClick={close} className={`btn-ghost ${stacked ? 'justify-start' : ''}`}>
        Watch Live
      </Link>
      {isAuthenticated ? (
        <>
          <Link to={homeFor} onClick={close} className={`btn-ghost ${stacked ? 'justify-start' : ''}`}>
            {homeLabel}
          </Link>
          {stacked && user?.name && (
            <span className="px-2 py-1 text-sm text-slate-500">Signed in as {user.name}</span>
          )}
          <button type="button" className="btn-primary" onClick={handleLogout}>
            Log out
          </button>
        </>
      ) : (
        <Link to="/login" onClick={close} className="btn-primary">
          Customer Login
        </Link>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" onClick={close} className="flex items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt={settings.companyName} className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">
              {(settings.companyName || 'M').charAt(0)}
            </span>
          )}
          <span className="flex flex-col leading-tight">
            <span className="font-display text-base font-bold text-brand-700 sm:text-lg">
              {settings.companyName}
            </span>
            {settings.tagline && (
              <span className="hidden text-[11px] text-slate-500 sm:block">{settings.tagline}</span>
            )}
          </span>
        </Link>

        <div className="hidden items-center gap-1.5 sm:flex">
          <NavLinks />
        </div>

        <button
          type="button"
          className="btn-ghost px-2 sm:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-2">
            <NavLinks stacked />
          </div>
        </div>
      )}
    </header>
  );
}
