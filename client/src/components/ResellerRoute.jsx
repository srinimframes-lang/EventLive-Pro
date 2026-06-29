import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ResellerRoute({ children }) {
  const { isAuthenticated, isSubAdmin, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admins may view reseller pages too; everyone else goes to their dashboard.
  if (!isSubAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
