import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import StaffRoute from './components/StaffRoute.jsx';
import ResellerRoute from './components/ResellerRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Home from './pages/Home.jsx';

// Route-based code splitting for non-home surfaces.
const Login = lazy(() => import('./pages/Login.jsx'));
const AdminLogin = lazy(() => import('./pages/AdminLogin.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Book = lazy(() => import('./pages/Book.jsx'));
const Events = lazy(() => import('./pages/Events.jsx'));
const EventDetail = lazy(() => import('./pages/EventDetail.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Districts = lazy(() => import('./pages/Districts.jsx'));
const DistrictDetail = lazy(() => import('./pages/DistrictDetail.jsx'));
const Watch = lazy(() => import('./pages/Watch.jsx'));
const Embed = lazy(() => import('./pages/Embed.jsx'));
const Studio = lazy(() => import('./pages/Studio.jsx'));
const BookingNew = lazy(() => import('./pages/BookingNew.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Reseller = lazy(() => import('./pages/Reseller.jsx'));
const EventForm = lazy(() => import('./pages/EventForm.jsx'));
const CreateLiveLink = lazy(() => import('./pages/CreateLiveLink.jsx'));
const WeddingCardUpload = lazy(() => import('./pages/WeddingCardUpload.jsx'));

function PageLoader() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-6xl px-4 py-20" aria-busy="true">
      <p className="text-center text-slate-500">Loading…</p>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const isEmbed = pathname.startsWith('/embed/');

  return (
    <div className="flex min-h-screen flex-col">
      {!isEmbed && <Navbar />}
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/register" element={<Register />} />

            {/* Booking (public info + customer flow) */}
            <Route path="/book" element={<Book />} />
            <Route
              path="/book/new"
              element={
                <ProtectedRoute>
                  <BookingNew />
                </ProtectedRoute>
              }
            />

            {/* Public watch — primary URL is /:eventCode; legacy /live and /watch kept */}
            <Route path="/events" element={<Events />} />
            <Route path="/districts" element={<Districts />} />
            <Route path="/districts/:slug" element={<DistrictDetail />} />
            <Route path="/events/:idOrSlug/live" element={<Watch />} />
            <Route path="/live/:idOrSlug" element={<Watch />} />
            <Route path="/live/:idOrSlug/:coupleSlug" element={<Watch />} />
            <Route path="/watch/:idOrSlug" element={<Watch />} />
            <Route path="/watch/:idOrSlug/:coupleSlug" element={<Watch />} />
            {/* Minimal iframe player — no site chrome */}
            <Route path="/embed/:shortCode" element={<Embed />} />

            {/* Event management (admin or reseller who owns the event) */}
            <Route
              path="/live-links/new"
              element={
                <ProtectedRoute>
                  <CreateLiveLink />
                </ProtectedRoute>
              }
            />
            <Route
              path="/live-links/:id/edit"
              element={
                <ProtectedRoute>
                  <CreateLiveLink />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/new"
              element={
                <StaffRoute>
                  <EventForm />
                </StaffRoute>
              }
            />
            <Route
              path="/events/:id/edit"
              element={
                <StaffRoute>
                  <EventForm />
                </StaffRoute>
              }
            />
            <Route
              path="/events/:id/studio"
              element={
                <StaffRoute>
                  <Studio />
                </StaffRoute>
              }
            />
            <Route path="/events/:idOrSlug" element={<EventDetail />} />

            {/* Dashboards */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wedding-card"
              element={
                <ProtectedRoute>
                  <WeddingCardUpload />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/reseller"
              element={
                <ResellerRoute>
                  <Reseller />
                </ResellerRoute>
              }
            />

            {/* Short public event URL: https://livestreamhub.in/<eventCode>[/optional-slug] */}
            <Route path="/:idOrSlug/:coupleSlug" element={<Watch />} />
            <Route path="/:idOrSlug" element={<Watch />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </Suspense>
      </main>
      {!isEmbed && <Footer />}
    </div>
  );
}
