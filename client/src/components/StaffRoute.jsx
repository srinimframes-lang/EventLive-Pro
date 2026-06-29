import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Allows the Super Admin or a reseller (sub admin) — used for event
 * create/edit/studio pages. Customers are redirected to their dashboard.
 */
export default function StaffRoute({ children }) {
  const { isAuthenticated, isAdmin, isSubAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin && !isSubAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
