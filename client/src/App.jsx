import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import StaffRoute from './components/StaffRoute.jsx';
import ResellerRoute from './components/ResellerRoute.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import Register from './pages/Register.jsx';
import Book from './pages/Book.jsx';
import BookingNew from './pages/BookingNew.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';
import Reseller from './pages/Reseller.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import EventForm from './pages/EventForm.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Code-split the live-streaming pages so heavy deps (hls.js, socket.io-client)
// load only when needed.
const Watch = lazy(() => import('./pages/Watch.jsx'));
const Studio = lazy(() => import('./pages/Studio.jsx'));

function PageLoader() {
  return <p className="py-20 text-center text-slate-500">Loading…</p>;
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
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

            {/* Public watch */}
            <Route path="/events" element={<Events />} />
            <Route path="/events/:idOrSlug/live" element={<Watch />} />
            <Route path="/live/:idOrSlug" element={<Watch />} />
            <Route path="/live/:idOrSlug/:coupleSlug" element={<Watch />} />
            <Route path="/watch/:idOrSlug" element={<Watch />} />
            <Route path="/watch/:idOrSlug/:coupleSlug" element={<Watch />} />

            {/* Event management (admin or reseller who owns the event) */}
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

            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
