import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">
        Welcome back, {user?.name?.split(' ')[0] || 'there'} 👋
      </h1>
      <p className="mt-1 text-slate-600">Here is your event control center.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Upcoming events</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">0</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Total attendees</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">0</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Live now</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">0</p>
        </div>
      </div>

      <div className="card mt-6">
        <h2 className="text-lg font-bold text-slate-900">Your account</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">Name</dt>
            <dd className="font-medium text-slate-800">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Email</dt>
            <dd className="font-medium text-slate-800">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Role</dt>
            <dd className="font-medium capitalize text-slate-800">{user?.role}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
