import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">E</span>
          EventLive&nbsp;Pro
        </Link>

        <div className="flex items-center gap-2">
          <Link to="/events" className="btn-ghost">
            Events
          </Link>
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="btn-ghost">
                Dashboard
              </Link>
              <span className="hidden text-sm text-slate-500 sm:inline">{user?.name}</span>
              <button type="button" className="btn-primary" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Log in
              </Link>
              <Link to="/register" className="btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
