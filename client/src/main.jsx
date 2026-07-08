import { HelmetProvider } from 'react-helmet-async';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import SiteAnalytics, { useGaPageView } from './components/seo/SiteAnalytics.jsx';
import './index.css';

function GaRouteTracker() {
  const { pathname } = useLocation();
  useGaPageView(pathname);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <SettingsProvider>
          <AuthProvider>
            <SiteAnalytics />
            <GaRouteTracker />
            <App />
          </AuthProvider>
        </SettingsProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
