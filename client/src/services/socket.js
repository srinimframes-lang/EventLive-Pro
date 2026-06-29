import { io } from 'socket.io-client';

/**
 * Creates a Socket.IO client connection to the realtime gateway.
 * In dev, Vite proxies `/socket.io` to the backend; in production the socket
 * connects to the same origin (or VITE_SOCKET_URL when explicitly set).
 *
 * @returns {import('socket.io-client').Socket}
 */
export function createSocket() {
  // Prefer an explicit socket URL, otherwise reuse the backend origin from
  // VITE_API_URL (trailing slash / `/api` stripped). Empty -> same origin,
  // which the Vite dev proxy forwards to the backend.
  const explicit = (import.meta.env.VITE_SOCKET_URL || '').trim();
  const apiOrigin = (import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
  const url = explicit || apiOrigin || undefined;
  const token = localStorage.getItem('token') || undefined;

  return io(url, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: token ? { token } : {},
  });
}
