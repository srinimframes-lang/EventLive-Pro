import axios from 'axios';
import { API_ORIGIN } from '../config.js';

// Every request path already includes the `/api` prefix; API_ORIGIN is the bare
// backend origin (see config.js). Empty means "same origin" (dev via Vite proxy).
const api = axios.create({
  baseURL: API_ORIGIN,
  withCredentials: true,
  timeout: 90_000,
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
      error.code === 'ECONNABORTED'
        ? 'Request timed out. The server may be waking up — please try again.'
        : error.response?.data?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
