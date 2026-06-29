import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Book from './pages/Book.jsx';
import BookingNew from './pages/BookingNew.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import EventForm from './pages/EventForm.jsx';
import NotFound from './pages/NotFound.jsx';

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
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
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

            {/* Event management (owner/admin) */}
            <Route
              path="/events/new"
              element={
                <AdminRoute>
                  <EventForm />
                </AdminRoute>
              }
            />
            <Route
              path="/events/:id/edit"
              element={
                <AdminRoute>
                  <EventForm />
                </AdminRoute>
              }
            />
            <Route
              path="/events/:id/studio"
              element={
                <AdminRoute>
                  <Studio />
                </AdminRoute>
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

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
