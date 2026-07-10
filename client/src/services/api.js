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
    const method = error.config?.method?.toUpperCase() || 'REQUEST';
    const url = error.config?.url || '';
    const status = error.response?.status;
    const serverMessage = error.response?.data?.message;
    const message =
      error.code === 'ECONNABORTED'
        ? 'Request timed out. The server may be waking up — please try again.'
        : serverMessage || error.message || 'Something went wrong';

    // eslint-disable-next-line no-console
    console.error('[API]', method, url, {
      status,
      code: error.code,
      message: serverMessage || error.message,
      data: error.response?.data,
    });

    const err = new Error(message);
    err.status = status;
    err.code = error.code;
    err.response = error.response;
    return Promise.reject(err);
  }
);

export default api;
