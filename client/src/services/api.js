import axios from 'axios';

// Resolve the backend ORIGIN. Every request path already includes the `/api`
// prefix, so we normalise away any trailing slash or trailing `/api` here to
// avoid duplicated segments (e.g. `/api/api/...`). An empty value means
// "same origin" — which in dev is forwarded to the backend by the Vite proxy.
const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();
const API_ORIGIN = RAW_API_URL.replace(/\/+$/, '').replace(/\/api$/i, '');

const api = axios.create({
  baseURL: API_ORIGIN,
  withCredentials: true,
});

// Attach the bearer token (if present) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalise error messages coming back from the API.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
