import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

/**
 * Dedicated, secure entry point for the Super Admin. Only accounts with the
 * 'admin' role are allowed through — anyone else is signed out immediately.
 */
export default function AdminLogin() {
  const { login, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form);
      if (user?.role !== 'admin') {
        await logout();
        setError('This account is not authorised for the Admin Panel.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="text-center">
        <span className="badge bg-brand-100 text-brand-700">Restricted area</span>
        <h1 className="mt-3 font-display text-3xl font-bold text-slate-900">Admin Panel Login</h1>
        <p className="mt-1 text-slate-600">
          Sign in to the {settings.companyName} Super Admin console.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card mt-6 space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <div>
          <label htmlFor="email" className="label">
            Admin email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            value={form.email}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            value={form.password}
            onChange={handleChange}
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Enter Admin Panel'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-400">
        Authorised personnel only. All access is logged.
      </p>
    </div>
  );
}
