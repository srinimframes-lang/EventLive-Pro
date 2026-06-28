import { io } from 'socket.io-client';

/**
 * Creates a Socket.IO client connection to the realtime gateway.
 * In dev, Vite proxies `/socket.io` to the backend; in production the socket
 * connects to the same origin (or VITE_SOCKET_URL when explicitly set).
 *
 * @returns {import('socket.io-client').Socket}
 */
export function createSocket() {
  const url = import.meta.env.VITE_SOCKET_URL || undefined;
  const token = localStorage.getItem('token') || undefined;

  return io(url, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: token ? { token } : {},
  });
}
